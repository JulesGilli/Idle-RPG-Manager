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
import { buildHeroSnapshot, type HeroSnapshotInput } from '@shared/progression/heroLoan.ts';
import { computeSetBonuses } from '@shared/progression/sets.ts';
import { BORROW_LIMIT_PER_TEAM, BORROW_DUNGEON_PER_DAY } from '@shared/progression/garrison.ts';
import {
  simulateDungeonRun,
  dungeonCooldownRemaining,
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

/** Incrémente le compteur (donjon/carte) d'un héros emprunté pour aujourd'hui. */
// deno-lint-ignore no-explicit-any
async function bumpBorrowUsage(
  // deno-lint-ignore no-explicit-any
  admin: any,
  borrowerId: string,
  heroId: string,
  today: string,
  delta: { dungeon_runs?: number; map_fights?: number },
): Promise<void> {
  const { data: row } = await admin
    .from('garrison_borrow_usage')
    .select('dungeon_runs, map_fights')
    .eq('borrower_player_id', borrowerId)
    .eq('hero_id', heroId)
    .eq('usage_date', today)
    .maybeSingle();
  await admin.from('garrison_borrow_usage').upsert(
    {
      borrower_player_id: borrowerId,
      hero_id: heroId,
      usage_date: today,
      dungeon_runs: (row?.dungeon_runs ?? 0) + (delta.dungeon_runs ?? 0),
      map_fights: (row?.map_fights ?? 0) + (delta.map_fights ?? 0),
    },
    { onConflict: 'borrower_player_id,hero_id,usage_date' },
  );
}

type Body = { dungeon_type_id?: unknown; hero_ids?: unknown };

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
  'weapon:items!heroes_equipped_weapon_id_fkey(atk_bonus, def_bonus, hp_bonus, set_id), ' +
  'armor:items!heroes_equipped_armor_id_fkey(atk_bonus, def_bonus, hp_bonus, set_id), ' +
  'jewel:items!heroes_equipped_jewel_id_fkey(atk_bonus, def_bonus, hp_bonus, passive_type, passive_value, set_id), ' +
  'relic:items!heroes_equipped_relic_id_fkey(atk_bonus, def_bonus, hp_bonus, set_id)';

/** Ligne héros (DB) → ingrédients de snapshot (mêmes règles que le build normal). */
// deno-lint-ignore no-explicit-any
function toSnapshotInput(h: any): HeroSnapshotInput {
  const cls = h.cls;
  const sum = (k: string) =>
    (h.weapon?.[k] ?? 0) + (h.armor?.[k] ?? 0) + (h.jewel?.[k] ?? 0) + (h.relic?.[k] ?? 0);
  const setB = computeSetBonuses([h.weapon?.set_id, h.armor?.set_id, h.jewel?.set_id, h.relic?.set_id]);
  return {
    id: h.id,
    name: h.name,
    classId: h.class_id,
    level: h.level,
    classBase: { hp: cls.base_hp, atk: cls.base_atk, def: cls.base_def, speed: cls.base_speed },
    innate: { hp: h.bonus_hp ?? 0, atk: h.bonus_atk ?? 0, def: h.bonus_def ?? 0, speed: h.bonus_speed ?? 0 },
    alloc: { hp: h.alloc_hp, atk: h.alloc_atk, def: h.alloc_def, speed: h.alloc_speed },
    equipment: { atk: sum('atk_bonus') + setB.atk, def: sum('def_bonus') + setB.def, hp: sum('hp_bonus') + setB.hp },
    jewelPassive:
      h.jewel?.passive_type && (h.jewel?.passive_value ?? 0) > 0
        ? { type: h.jewel.passive_type, value: h.jewel.passive_value / 100 }
        : null,
    skills: (h.skills ?? {}) as Record<string, number>,
    loadout: { activeId: h.active_skill_id ?? null, ultimateId: h.ultimate_skill_id ?? null },
    setIds: [h.weapon?.set_id, h.armor?.set_id, h.jewel?.set_id, h.relic?.set_id],
  };
}

/** Ensemble des héros engagés dans une activité IDLE (farm 'loop' ou expédition en cours).
 *  Les déploiements 'advance' (assauts manuels) ne réservent PAS les héros. */
async function engagedInActivity(admin: Admin): Promise<Set<string>> {
  const engaged = new Set<string>();
  const { data: deps } = await admin.from('deployments').select('hero_ids').eq('mode', 'loop');
  for (const r of deps ?? []) for (const h of (r.hero_ids as string[]) ?? []) engaged.add(h);
  const { data: exps } = await admin
    .from('expedition_runs')
    .select('hero_ids')
    .eq('status', 'in_progress');
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

async function addResources(
  admin: Admin,
  userId: string,
  resources: Record<string, number>,
): Promise<void> {
  for (const [resource, add] of Object.entries(resources)) {
    if (add <= 0) continue;
    const { data: row } = await admin
      .from('player_resources')
      .select('amount')
      .eq('player_id', userId)
      .eq('resource', resource)
      .maybeSingle();
    await admin
      .from('player_resources')
      .upsert(
        { player_id: userId, resource, amount: (row?.amount ?? 0) + add },
        { onConflict: 'player_id,resource' },
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
  if (!Array.isArray(heroIds) || heroIds.some((h) => typeof h !== 'string')) {
    return json({ error: 'hero_ids invalide' }, 400);
  }
  const unique = [...new Set(heroIds as string[])];
  if (unique.length < 1 || unique.length > MAX_TEAM) {
    return json({ error: `Entre 1 et ${MAX_TEAM} héros` }, 400);
  }

  const admin: Admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

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
  // On repart du dernier run de CE donjon par le joueur (dungeon_runs.created_at).
  const { data: lastRun } = await admin
    .from('dungeon_runs')
    .select('created_at')
    .eq('player_id', user.id)
    .eq('dungeon_type_id', dungeon.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastRun?.created_at) {
    const remaining = dungeonCooldownRemaining(
      new Date(lastRun.created_at).getTime(),
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
  const seed = Math.floor(Math.random() * 2_147_483_647);
  const run = simulateDungeonRun(seed, squad, dungeon);

  // --- Crédit du loot (complet ou partiel) ---
  const lootMap: Record<string, number> = {};
  for (const drop of run.lootRolled) lootMap[drop.resource] = drop.amount;
  await addResources(admin, user.id, lootMap);

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
