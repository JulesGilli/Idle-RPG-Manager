// Edge Function : resolve-dungeon-run
// Résout un DONJON multi-combats côté serveur (anti-triche) et renvoie de quoi
// rejouer le run déjà résolu. La séquence de combats, la regen inter-combat et
// le loot sont calculés par /shared/progression/dungeon.ts (pur, déterministe).
//
// Supporte l'EMPRUNT de héros (hero sharing) : un hero_id non possédé par
// l'appelant est utilisé via un SNAPSHOT figé (buildHeroSnapshot) et journalisé
// dans hero_loans. Le héros du propriétaire n'est jamais modifié.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import type { CombatantInput } from '@shared/combat/index.ts';
import { buildHeroSnapshot, itemCombatPassive, type HeroSnapshotInput } from '@shared/progression/heroLoan.ts';
import { computeSetBonuses } from '@shared/progression/sets.ts';
import { BORROW_LIMIT_PER_TEAM, BORROW_DUNGEON_PER_DAY } from '@shared/progression/garrison.ts';
import {
  simulateDungeonRun,
  dungeonCooldownRemaining,
  dungeonCooldownSeconds,
  dungeonCooldownFor,
  dungeonProgressFraction,
  rollDungeonSkipLoot,
  type DungeonType,
  type LootEntry,
  type DungeonFightDef,
} from '@shared/progression/dungeon.ts';
import {
  combatBuff,
  applyCombatBuff,
  NO_COMBAT_BUFF,
  type GuildAlloc,
  type GuildCombatBuff,
} from '@shared/progression/guildSkills.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_TEAM = 5;

/** Date du jour 'YYYY-MM-DD' au fuseau Europe/Paris (indépendant de l'horloge client). */
function parisToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Nombre de donjons déjà faits aujourd'hui avec chaque héros emprunté (par l'emprunteur). */
// deno-lint-ignore no-explicit-any
async function dungeonUsageToday(
  // deno-lint-ignore no-explicit-any
  admin: any,
  borrowerId: string,
  heroIds: string[],
  today: string,
): Promise<Map<string, number>> {
  const used = new Map<string, number>();
  if (heroIds.length === 0) return used;
  const { data } = await admin
    .from('garrison_borrow_usage')
    .select('hero_id, dungeon_runs')
    .eq('borrower_player_id', borrowerId)
    .eq('usage_date', today)
    .in('hero_id', heroIds);
  for (const r of data ?? []) used.set(r.hero_id as string, (r.dungeon_runs as number) ?? 0);
  return used;
}

/**
 * Incrémente le compteur (donjon/carte) d'un héros emprunté pour aujourd'hui,
 * de façon ATOMIQUE (RPC increment_borrow_usage : upsert-incrément par colonne).
 * Indispensable car carte ET donjon écrivent la même ligne : un read-modify-write
 * réécrivant les deux colonnes ferait perdre des incréments (→ cap contournable).
 */
async function bumpBorrowUsage(
  // deno-lint-ignore no-explicit-any
  admin: any,
  borrowerId: string,
  heroId: string,
  today: string,
  delta: { dungeon_runs?: number; map_fights?: number },
): Promise<void> {
  await admin.rpc('increment_borrow_usage', {
    p_borrower: borrowerId,
    p_hero: heroId,
    p_date: today,
    p_dungeon: delta.dungeon_runs ?? 0,
    p_map: delta.map_fights ?? 0,
  });
}

type Body = { dungeon_type_id?: unknown; hero_ids?: unknown; skip?: unknown };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// deno-lint-ignore no-explicit-any
type Admin = any;

/** Buff de combat de l'arbre de guilde de l'appelant (neutre si sans guilde). */
async function dungeonGuildBuff(admin: Admin, userId: string): Promise<GuildCombatBuff> {
  const { data: mem } = await admin
    .from('guild_members')
    .select('guild_id')
    .eq('player_id', userId)
    .maybeSingle();
  if (!mem?.guild_id) return NO_COMBAT_BUFF;
  const { data: g } = await admin.from('guilds').select('skill_alloc').eq('id', mem.guild_id).single();
  return combatBuff((g?.skill_alloc ?? {}) as GuildAlloc);
}

const HERO_SELECT =
  'id, name, class_id, level, owner_id, alloc_hp, alloc_atk, alloc_def, alloc_speed, skills, ' +
  'active_skill_id, ultimate_skill_id, ' +
  'bonus_hp, bonus_atk, bonus_def, bonus_speed, ' +
  'cls:hero_classes!heroes_class_id_fkey(base_hp, base_atk, base_def, base_speed), ' +
  'weapon:items!heroes_equipped_weapon_id_fkey(name, atk_bonus, def_bonus, hp_bonus, set_id, blessing_level, passive_type, passive_value), ' +
  'armor:items!heroes_equipped_armor_id_fkey(atk_bonus, def_bonus, hp_bonus, set_id, passive_type, passive_value), ' +
  'jewel:items!heroes_equipped_jewel_id_fkey(atk_bonus, def_bonus, hp_bonus, passive_type, passive_value, set_id), ' +
  'relic:items!heroes_equipped_relic_id_fkey(atk_bonus, def_bonus, hp_bonus, set_id, passive_type, passive_value), rune:runes!heroes_rune_id_fkey(set_id)';

/** Ligne héros (DB) → ingrédients de snapshot (mêmes règles que le build normal). */
// deno-lint-ignore no-explicit-any
function toSnapshotInput(h: any): HeroSnapshotInput {
  const cls = h.cls;
  const sum = (k: string) =>
    (h.weapon?.[k] ?? 0) + (h.armor?.[k] ?? 0) + (h.jewel?.[k] ?? 0) + (h.relic?.[k] ?? 0);
  const setB = computeSetBonuses([h.weapon?.set_id, h.armor?.set_id, h.jewel?.set_id, h.relic?.set_id], h.class_id);
  return {
    id: h.id,
    name: h.name,
    classId: h.class_id,
    level: h.level,
    classBase: { hp: cls.base_hp, atk: cls.base_atk, def: cls.base_def, speed: cls.base_speed },
    innate: { hp: h.bonus_hp ?? 0, atk: h.bonus_atk ?? 0, def: h.bonus_def ?? 0, speed: h.bonus_speed ?? 0 },
    alloc: { hp: h.alloc_hp, atk: h.alloc_atk, def: h.alloc_def, speed: h.alloc_speed },
    equipment: { atk: sum('atk_bonus') + setB.atk, def: sum('def_bonus') + setB.def, hp: sum('hp_bonus') + setB.hp },
    jewelPassive: itemCombatPassive(h.jewel),
    weaponPassive: itemCombatPassive(h.weapon),
    relicPassive: itemCombatPassive(h.relic),
    armorPassive: itemCombatPassive(h.armor),
    skills: (h.skills ?? {}) as Record<string, number>,
    loadout: { activeId: h.active_skill_id ?? null, ultimateId: h.ultimate_skill_id ?? null },
    weapon: h.weapon ? { name: h.weapon.name, blessingLevel: h.weapon.blessing_level ?? 0 } : null,
    runeSetId: h.rune?.set_id ?? null,
    setIds: [h.weapon?.set_id, h.armor?.set_id, h.jewel?.set_id, h.relic?.set_id],
  };
}

/** Héros engagés dans une activité IDLE (farm 'loop').
 *
 *  Une EXPÉDITION n'immobilise PLUS ses héros : elle tourne en arrière-plan et
 *  ils restent utilisables partout ailleurs. */
async function engagedInActivity(admin: Admin): Promise<Set<string>> {
  const engaged = new Set<string>();
  const { data: deps } = await admin.from('deployments').select('hero_ids').eq('mode', 'loop');
  for (const r of deps ?? []) for (const h of (r.hero_ids as string[]) ?? []) engaged.add(h);
  // Expedition : ne bloque QUE si le run verrouille (palier Intendance autonome).
  const { data: exps } = await admin
    .from('expedition_runs')
    .select('hero_ids')
    .eq('status', 'in_progress')
    .eq('locks_heroes', true);
  for (const r of exps ?? []) for (const h of (r.hero_ids as string[]) ?? []) engaged.add(h);
  return engaged;
}

/** Guilde de l'appelant (ou null s'il n'en a pas). */
async function guildIdOf(admin: Admin, userId: string): Promise<string | null> {
  const { data } = await admin
    .from('guild_members')
    .select('guild_id')
    .eq('player_id', userId)
    .maybeSingle();
  return data?.guild_id ?? null;
}

/** Arc courant du joueur (1 par défaut). Pilote le tier de loot + le scaling. */
async function currentArcOf(admin: Admin, userId: string): Promise<number> {
  const { data } = await admin
    .from('player_arc')
    .select('current_arc')
    .eq('player_id', userId)
    .maybeSingle();
  return Math.max(1, (data?.current_arc as number | undefined) ?? 1);
}

/**
 * Crédite des ressources au joueur AU TIER indiqué (= arc). Chaque tier est une
 * pile distincte : `(player_id, resource, tier)`. `tier` défaut 1 (arc de base).
 */
async function addResources(
  admin: Admin,
  userId: string,
  resources: Record<string, number>,
  tier = 1,
): Promise<void> {
  for (const [resource, add] of Object.entries(resources)) {
    if (add <= 0) continue;
    const { data: row } = await admin
      .from('player_resources')
      .select('amount')
      .eq('player_id', userId)
      .eq('resource', resource)
      .eq('tier', tier)
      .maybeSingle();
    await admin
      .from('player_resources')
      .upsert(
        { player_id: userId, resource, amount: (row?.amount ?? 0) + add, tier },
        { onConflict: 'player_id,resource,tier' },
      );
  }
}

// deno-lint-ignore no-explicit-any
function toDungeonType(row: any): DungeonType {
  return {
    id: row.id,
    name: row.name,
    tier: row.tier,
    monsterSequence: (row.monster_sequence ?? []) as DungeonFightDef[],
    regenPctBetweenFights: Number(row.regen_pct_between_fights),
    minibossIndices: (row.miniboss_indices ?? []) as number[],
    bossIndex: row.boss_index,
    lootTableNormal: (row.loot_table_normal ?? []) as LootEntry[],
    lootTableMiniboss: (row.loot_table_miniboss ?? []) as LootEntry[],
    lootTableBoss: (row.loot_table_boss ?? []) as LootEntry[],
  };
}

/**
 * SKIP d'un donjon déjà vaincu : aucun combat simulé, butin des tables complètes,
 * cooldown PLEIN. Réutilise le même compare-and-swap que le run normal — sans
 * lui, deux onglets skiperaient en parallèle et doubleraient le butin.
 */
async function handleSkip(admin: Admin, userId: string, dungeonTypeId: string): Promise<Response> {
  // Éligibilité : ce donjon doit avoir été RÉUSSI au moins une fois. Il n'existe
  // pas de table de clears, la vérité est dans l'historique des runs (le même
  // pattern qu'utilisent déjà recruit/titles pour les slots d'effectif).
  const { data: clear } = await admin
    .from('dungeon_runs')
    .select('id')
    .eq('player_id', userId)
    .eq('dungeon_type_id', dungeonTypeId)
    .eq('success', true)
    .limit(1)
    .maybeSingle();
  if (!clear) {
    return json({ error: 'Termine ce donjon au moins une fois avant de pouvoir le passer.' }, 403);
  }

  const { data: row } = await admin
    .from('dungeon_types')
    .select('*')
    .eq('id', dungeonTypeId)
    .maybeSingle();
  if (!row) return json({ error: 'Donjon inconnu' }, 404);
  const dungeon = toDungeonType(row);

  const fullCooldown = dungeonCooldownSeconds(dungeon.tier);
  const cutoffIso = new Date(Date.now() - fullCooldown * 1000).toISOString();
  await admin.from('dungeon_cooldowns').upsert(
    { player_id: userId, dungeon_type_id: dungeon.id, last_run_at: '1970-01-01T00:00:00Z' },
    { onConflict: 'player_id,dungeon_type_id', ignoreDuplicates: true },
  );
  const { data: reserved } = await admin
    .from('dungeon_cooldowns')
    .update({ last_run_at: new Date().toISOString() })
    .eq('player_id', userId)
    .eq('dungeon_type_id', dungeon.id)
    .lte('last_run_at', cutoffIso)
    .select('player_id');
  if (!reserved || reserved.length === 0) {
    return json({ error: 'Donjon en cooldown — réessaie plus tard' }, 429);
  }

  const arc = await currentArcOf(admin, userId);
  const seed = Math.floor(Math.random() * 2_147_483_647);
  const loot = rollDungeonSkipLoot(seed, dungeon);

  const lootMap: Record<string, number> = {};
  for (const drop of loot) lootMap[drop.resource] = drop.amount;
  await addResources(admin, userId, lootMap, arc);

  const reachedIndex = dungeon.monsterSequence.length - 1;
  const { data: inserted } = await admin
    .from('dungeon_runs')
    .insert({
      player_id: userId,
      dungeon_type_id: dungeon.id,
      hero_ids: [],
      seed,
      // `fight_results` vide + marqueur explicite : le front doit savoir qu'il
      // n'y a pas de replay à jouer plutôt que de tomber sur un tableau vide.
      result: { skipped: true, fightResults: [], success: true, reachedIndex, lootRolled: loot },
      success: true,
      reached_index: reachedIndex,
    })
    .select('id')
    .maybeSingle();

  return json({
    run_id: inserted?.id ?? null,
    skipped: true,
    success: true,
    reached_index: reachedIndex,
    seed,
    dungeon: { id: dungeon.id, name: dungeon.name, tier: dungeon.tier },
    fight_results: [],
    loot,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey)
    return json({ error: 'Config serveur manquante' }, 500);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Non authentifié' }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: 'Session invalide' }, 401);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: 'Corps de requête invalide' }, 400);
  }
  const dungeonTypeId = body.dungeon_type_id;
  const heroIds = body.hero_ids;
  if (typeof dungeonTypeId !== 'string') return json({ error: 'dungeon_type_id invalide' }, 400);

  const admin: Admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // --- SKIP : rejouer d'un coup un donjon DÉJÀ vaincu ---
  // Refaire un combat qu'on a déjà gagné n'apporte rien qu'un risque et une
  // minute d'animation. Le skip ne mobilise donc aucun héros — mais il coûte le
  // cooldown PLEIN, sinon il deviendrait une source de butin sans limite.
  if (body.skip === true) {
    return await handleSkip(admin, user.id, dungeonTypeId);
  }

  if (!Array.isArray(heroIds) || heroIds.some((h) => typeof h !== 'string')) {
    return json({ error: 'hero_ids invalide' }, 400);
  }
  const unique = [...new Set(heroIds as string[])];
  if (unique.length < 1 || unique.length > MAX_TEAM) {
    return json({ error: `Entre 1 et ${MAX_TEAM} héros` }, 400);
  }

  // --- Chargement des héros POSSÉDÉS (build live) ---
  const { data: ownedRows } = await admin
    .from('heroes')
    .select(HERO_SELECT)
    .in('id', unique)
    .eq('owner_id', user.id);
  const ownedIds = new Set((ownedRows ?? []).map((h: { id: string }) => h.id));

  // Les héros non possédés sont des renforts empruntés à la GARNISON de la guilde
  // (snapshot figé). Au plus BORROW_LIMIT_PER_TEAM par équipe.
  const borrowedIds = unique.filter((id) => !ownedIds.has(id));
  if (borrowedIds.length > BORROW_LIMIT_PER_TEAM) {
    return json({ error: `Un seul héros emprunté par équipe` }, 400);
  }

  // --- Dispo : les héros À SOI ne doivent pas être engagés ailleurs (farm/expé).
  // Les empruntés sont des snapshots → jamais bloqués (le proprio garde son héros). ---
  const engaged = await engagedInActivity(admin);
  for (const id of ownedIds) {
    if (engaged.has(id)) {
      return json({ error: 'Un héros est déjà engagé dans une autre activité' }, 409);
    }
  }

  // --- Renforts : chargés depuis la garnison de la guilde de l'appelant ---
  const borrowedSnapshots = new Map<string, { snapshot: CombatantInput; ownerId: string }>();
  if (borrowedIds.length > 0) {
    const guildId = await guildIdOf(admin, user.id);
    if (!guildId) return json({ error: 'Renfort de guilde impossible hors guilde' }, 403);
    const { data: grows } = await admin
      .from('guild_garrison')
      .select('hero_id, hero_snapshot, owner_player_id')
      .eq('guild_id', guildId)
      .in('hero_id', borrowedIds);
    for (const r of grows ?? []) {
      borrowedSnapshots.set(r.hero_id as string, {
        snapshot: r.hero_snapshot as CombatantInput,
        ownerId: r.owner_player_id as string,
      });
    }
    if (borrowedIds.some((id) => !borrowedSnapshots.has(id))) {
      return json({ error: 'Héros emprunté indisponible' }, 403);
    }
  }

  if (ownedIds.size + borrowedSnapshots.size !== unique.length) {
    return json({ error: 'Héros introuvables' }, 404);
  }

  // Donjon.
  const { data: dungeonRow, error: dungeonError } = await admin
    .from('dungeon_types')
    .select('*')
    .eq('id', dungeonTypeId)
    .single();
  if (dungeonError || !dungeonRow) return json({ error: 'Donjon introuvable' }, 404);
  const dungeon = toDungeonType(dungeonRow);
  if (dungeon.monsterSequence.length === 0) {
    return json({ error: 'Donjon mal configuré (séquence vide)' }, 400);
  }

  // --- Cooldown (anti-triche) : un donjon est une activité spéciale hors carte.
  //
  // La source de vérité est `dungeon_cooldowns.last_run_at`, PAS la date du
  // dernier run : depuis le cooldown proportionnel, ce timestamp est antidaté en
  // fonction de la progression (un run à 50 % s'écrit déjà vieux de la moitié du
  // cooldown). Lire `dungeon_runs.created_at` ici ré-imposerait le cooldown
  // plein et annulerait silencieusement tout le mécanisme.
  const { data: cdRow } = await admin
    .from('dungeon_cooldowns')
    .select('last_run_at')
    .eq('player_id', user.id)
    .eq('dungeon_type_id', dungeon.id)
    .maybeSingle();
  // Repli sur le dernier run pour les joueurs d'avant `dungeon_cooldowns` : sans
  // lui, la toute première lecture offrirait un run gratuit.
  const { data: lastRun } = await admin
    .from('dungeon_runs')
    .select('created_at')
    .eq('player_id', user.id)
    .eq('dungeon_type_id', dungeon.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const cooldownAnchor = cdRow?.last_run_at ?? lastRun?.created_at ?? null;
  if (cooldownAnchor) {
    const remaining = dungeonCooldownRemaining(
      new Date(cooldownAnchor).getTime(),
      dungeon.tier,
      Date.now(),
    );
    if (remaining > 0) {
      const h = Math.floor(remaining / 3600);
      const m = Math.ceil((remaining % 3600) / 60);
      const wait = h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
      return json({ error: `Donjon en cooldown — réessaie dans ${wait}` }, 429);
    }
  }

  // --- Escouade : possédés = build live ; empruntés = snapshot figé de la garnison ---
  // Buff de guilde (hors arène) appliqué à toute l'escouade.
  const guildBuff = await dungeonGuildBuff(admin, user.id);
  const snapshotById = new Map<string, CombatantInput>();
  // deno-lint-ignore no-explicit-any
  for (const h of (ownedRows ?? []) as any[]) {
    snapshotById.set(h.id, buildHeroSnapshot(toSnapshotInput(h), guildBuff));
  }
  for (const [id, b] of borrowedSnapshots) snapshotById.set(id, applyCombatBuff(b.snapshot, guildBuff));
  // Ordre stable = ordre demandé.
  const squad: CombatantInput[] = unique.map((id) => snapshotById.get(id)!);

  // --- Bridage anti-carry : un héros emprunté = 1 donjon / jour / emprunteur ---
  const today = parisToday();
  if (borrowedSnapshots.size > 0) {
    const usage = await dungeonUsageToday(admin, user.id, [...borrowedSnapshots.keys()], today);
    for (const heroId of borrowedSnapshots.keys()) {
      if ((usage.get(heroId) ?? 0) >= BORROW_DUNGEON_PER_DAY) {
        return json(
          { error: 'Ce renfort emprunté a déjà fait un donjon aujourd’hui (1/jour).' },
          429,
        );
      }
    }
  }

  // --- Seed SERVEUR + simulation pure ---
  // Arc courant : durcit les ennemis (scaling) ET estampille le loot au tier = arc.
  const arc = await currentArcOf(admin, user.id);
  const seed = Math.floor(Math.random() * 2_147_483_647);
  const run = simulateDungeonRun(seed, squad, dungeon, arc);

  // --- RÉSERVATION ATOMIQUE DU COOLDOWN (anti multi-onglets) ---
  // Le check de cooldown plus haut (lecture de dungeon_runs) est sujet à une race :
  // N onglets lançant le même donjon en parallèle le passent tous et doubleraient
  // le loot. On s'approprie donc le run via un compare-and-swap sur la table
  // mutable dungeon_cooldowns : on garantit d'abord une ligne (semée avec le
  // timestamp du DERNIER run réel, pour respecter un cooldown déjà en cours), puis
  // on avance last_run_at → maintenant UNIQUEMENT si le cooldown est écoulé. Un
  // seul UPDATE passe (Postgres sérialise la ligne), les autres → 429 sans crédit.
  const fullCooldown = dungeonCooldownSeconds(dungeon.tier);
  const cutoffIso = new Date(Date.now() - fullCooldown * 1000).toISOString();

  // COOLDOWN PROPORTIONNEL : on ne fait payer que ce qui a été consommé. Plutôt
  // que d'ajouter une colonne « durée due », on ANTIDATE le timestamp — un run à
  // 50 % s'inscrit comme s'il datait déjà d'une demi-période. Tout le reste du
  // jeu (check ci-dessus, front) continue de comparer au cooldown plein du tier
  // sans rien savoir de la progression.
  const progress = dungeonProgressFraction(
    run.reachedIndex,
    dungeon.monsterSequence.length,
    run.success,
  );
  const dueSeconds = dungeonCooldownFor(dungeon.tier, progress);
  const reservedAt = new Date(Date.now() - (fullCooldown - dueSeconds) * 1000).toISOString();

  await admin.from('dungeon_cooldowns').upsert(
    {
      player_id: user.id,
      dungeon_type_id: dungeon.id,
      last_run_at: lastRun?.created_at ?? '1970-01-01T00:00:00Z',
    },
    { onConflict: 'player_id,dungeon_type_id', ignoreDuplicates: true },
  );
  const { data: reserved } = await admin
    .from('dungeon_cooldowns')
    .update({ last_run_at: reservedAt })
    .eq('player_id', user.id)
    .eq('dungeon_type_id', dungeon.id)
    .lte('last_run_at', cutoffIso)
    .select('player_id');
  if (!reserved || reserved.length === 0) {
    return json({ error: 'Donjon en cooldown — réessaie plus tard' }, 429);
  }

  // --- Crédit du loot (complet ou partiel) ---
  const lootMap: Record<string, number> = {};
  for (const drop of run.lootRolled) lootMap[drop.resource] = drop.amount;
  await addResources(admin, user.id, lootMap, arc);

  // --- Persistance du run (service_role, bypass RLS) ---
  const { data: inserted, error: runError } = await admin
    .from('dungeon_runs')
    .insert({
      player_id: user.id,
      dungeon_type_id: dungeon.id,
      hero_ids: unique,
      seed,
      result: { fight_results: run.fightResults, loot: run.lootRolled },
      success: run.success,
      reached_index: run.reachedIndex,
    })
    .select('id')
    .single();
  if (runError) return json({ error: "Échec de l'enregistrement du run" }, 500);

  // --- Journalisation des emprunts (donjon = instantané → prêt one-shot) ---
  for (const [heroId, b] of borrowedSnapshots) {
    await admin.from('hero_loans').insert({
      owner_player_id: b.ownerId,
      hero_id: heroId,
      borrower_player_id: user.id,
      hero_snapshot: b.snapshot,
      activity_type: 'dungeon',
      activity_id: inserted?.id ?? null,
      // Donjon résolu dans la requête → le prêt n'a pas de durée persistante.
      expires_at: new Date().toISOString(),
    });
    // Consomme le quota donjon du jour pour ce renfort.
    await bumpBorrowUsage(admin, user.id, heroId, today, { dungeon_runs: 1 });
  }

  return json({
    run_id: inserted?.id ?? null,
    success: run.success,
    reached_index: run.reachedIndex,
    seed,
    dungeon: { id: dungeon.id, name: dungeon.name, tier: dungeon.tier },
    fight_results: run.fightResults,
    loot: run.lootRolled,
  });
});
