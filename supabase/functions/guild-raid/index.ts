// Edge Function : guild-raid
// Raids de guilde : lobby de mise en commun de héros (via hero_loans) résolu en
// UNE simulation serveur déterministe (réutilise simulateDungeonRun + buildHeroSnapshot).
// Actions : create_lobby | contribute | withdraw | cancel | resolve.
// Anti-triche : tout en service_role, seed serveur, loot crédité serveur.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import type { CombatantInput } from '@shared/combat/index.ts';
import { buildHeroSnapshot, type HeroSnapshotInput } from '@shared/progression/heroLoan.ts';
import { simulateDungeonRun, type DungeonType } from '@shared/progression/dungeon.ts';
import { computeSetBonuses } from '@shared/progression/sets.ts';
import {
  canStartRaid,
  guildLevel,
  raidCooldownRemaining,
  guildContributionPoints,
  guildXpForRaid,
  LOBBY_TTL_SECONDS,
  MAX_RAID_HEROES,
  type GuildRole,
} from '@shared/progression/guild.ts';
import {
  raidDifficultyMult,
  nextRaidLevel,
  combatBuff,
  MAX_RAID_LEVEL,
  type GuildAlloc,
} from '@shared/progression/guildSkills.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Body = { action?: unknown; raid_type_id?: unknown; lobby_id?: unknown; hero_ids?: unknown };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// deno-lint-ignore no-explicit-any
type Admin = any;

const HERO_SELECT =
  'id, name, class_id, level, owner_id, alloc_hp, alloc_atk, alloc_def, alloc_speed, skills, ' +
  'active_skill_id, ultimate_skill_id, ' +
  'bonus_hp, bonus_atk, bonus_def, bonus_speed, ' +
  'cls:hero_classes!heroes_class_id_fkey(base_hp, base_atk, base_def, base_speed), ' +
  'weapon:items!heroes_equipped_weapon_id_fkey(name, atk_bonus, def_bonus, hp_bonus, set_id, blessing_level), ' +
  'armor:items!heroes_equipped_armor_id_fkey(atk_bonus, def_bonus, hp_bonus, set_id), ' +
  'jewel:items!heroes_equipped_jewel_id_fkey(atk_bonus, def_bonus, hp_bonus, passive_type, passive_value, set_id), ' +
  'relic:items!heroes_equipped_relic_id_fkey(atk_bonus, def_bonus, hp_bonus, set_id), rune:runes!heroes_rune_id_fkey(set_id)';

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
    jewelPassive:
      h.jewel?.passive_type && (h.jewel?.passive_value ?? 0) > 0
        ? { type: h.jewel.passive_type, value: h.jewel.passive_value / 100 }
        : null,
    skills: (h.skills ?? {}) as Record<string, number>,
    loadout: { activeId: h.active_skill_id ?? null, ultimateId: h.ultimate_skill_id ?? null },
    weapon: h.weapon ? { name: h.weapon.name, blessingLevel: h.weapon.blessing_level ?? 0 } : null,
    runeSetId: h.rune?.set_id ?? null,
    setIds: [h.weapon?.set_id, h.armor?.set_id, h.jewel?.set_id, h.relic?.set_id],
  };
}

async function engagedInActivity(admin: Admin): Promise<Set<string>> {
  const engaged = new Set<string>();
  const { data: deps } = await admin.from('deployments').select('hero_ids');
  for (const r of deps ?? []) for (const h of (r.hero_ids as string[]) ?? []) engaged.add(h);
  const { data: exps } = await admin.from('expeditions').select('hero_ids');
  for (const r of exps ?? []) for (const h of (r.hero_ids as string[]) ?? []) engaged.add(h);
  const { data: loans } = await admin
    .from('hero_loans')
    .select('hero_id')
    .gt('expires_at', new Date().toISOString());
  for (const r of loans ?? []) engaged.add(r.hero_id as string);
  return engaged;
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

/** Renforce les ennemis d'un raid par un multiplicateur (scaling par niveau). */
function scaleRaidEnemies(raid: DungeonType, mult: number): DungeonType {
  if (mult <= 1) return raid;
  return {
    ...raid,
    monsterSequence: raid.monsterSequence.map((wave) => ({
      ...wave,
      enemies: wave.enemies.map((e) => ({
        ...e,
        hp: Math.round(e.hp * mult),
        atk: Math.round(e.atk * mult),
        def: Math.round(e.def * mult),
      })),
    })),
  };
}

/**
 * Choisit le raid de BASE d'une guilde (le même pour tous — la difficulté vient du
 * niveau, pas du type). On prend le tier le plus bas comme socle progressif.
 */
// deno-lint-ignore no-explicit-any
function pickBaseRaid(raidTypes: any[]): any | null {
  if (!raidTypes || raidTypes.length === 0) return null;
  return [...raidTypes].sort((a, b) => (a.tier ?? 1) - (b.tier ?? 1))[0];
}

// deno-lint-ignore no-explicit-any
function toDungeonType(row: any): DungeonType {
  return {
    id: row.id,
    name: row.name,
    tier: row.tier,
    monsterSequence: row.monster_sequence ?? [],
    regenPctBetweenFights: Number(row.regen_pct_between_fights),
    minibossIndices: row.miniboss_indices ?? [],
    bossIndex: row.boss_index,
    lootTableNormal: row.loot_table_normal ?? [],
    lootTableMiniboss: row.loot_table_miniboss ?? [],
    lootTableBoss: row.loot_table_boss ?? [],
  };
}

type Membership = { guild_id: string; role: GuildRole } | null;
async function membershipOf(admin: Admin, playerId: string): Promise<Membership> {
  const { data } = await admin.from('guild_members').select('guild_id, role').eq('player_id', playerId).maybeSingle();
  return data ? { guild_id: data.guild_id, role: data.role as GuildRole } : null;
}

/** Max de héros qu'un membre peut inscrire au raid du soir. */
const MAX_ENROLLED_HEROES = 2;

/** Résout le raid du soir d'UNE guilde à partir des héros inscrits (stats live). */
// deno-lint-ignore no-explicit-any
async function resolveRaidForGuild(admin: Admin, guild: any): Promise<boolean> {
  const { data: enrolls } = await admin
    .from('guild_raid_enrollments')
    .select('player_id, hero_ids')
    .eq('guild_id', guild.id);
  // deno-lint-ignore no-explicit-any
  const heroIds = [...new Set((enrolls ?? []).flatMap((e: any) => (e.hero_ids as string[]) ?? []))];
  if (heroIds.length === 0) return false;

  // Raid de BASE (même raid pour tous) + niveau progressif de la guilde. La
  // difficulté vient du niveau (highest_raid_cleared + 1), pas du type de raid.
  const { data: raidTypes } = await admin.from('guild_raid_types').select('*');
  const raidRow = pickBaseRaid(raidTypes ?? []);
  if (!raidRow) return false;
  const level = nextRaidLevel(guild.highest_raid_cleared ?? 0);
  const raid = scaleRaidEnemies(toDungeonType(raidRow), raidDifficultyMult(level));
  const buff = combatBuff((guild.skill_alloc ?? {}) as GuildAlloc);

  // Cooldown lié à la difficulté du raid visé (raid plus dur → repos plus long).
  const lastMs = guild.last_raid_at ? new Date(guild.last_raid_at).getTime() : null;
  if (raidCooldownRemaining(lastMs, raid.tier, Date.now()) > 0) return false;

  const { data: members } = await admin.from('guild_members').select('player_id').eq('guild_id', guild.id);
  // deno-lint-ignore no-explicit-any
  const memberIds = new Set((members ?? []).map((m: any) => m.player_id));

  const { data: heroRows } = await admin.from('heroes').select(HERO_SELECT).in('id', heroIds);
  // Dispo INDÉPENDANTE : on ne filtre PAS sur les activités en cours (déploiement/expédition).
  // deno-lint-ignore no-explicit-any
  const usable = (heroRows ?? []).filter((h: any) => memberIds.has(h.owner_id)) as any[];
  if (usable.length === 0) return false;
  const capped = usable.slice(0, MAX_RAID_HEROES);

  const snapshotById = new Map<string, CombatantInput>(
    capped.map((h) => [h.id, buildHeroSnapshot(toSnapshotInput(h), buff)]),
  );
  const squad: CombatantInput[] = capped.map((h) => snapshotById.get(h.id)!);
  const seed = Math.floor(Math.random() * 2_147_483_647);
  const run = simulateDungeonRun(seed, squad, raid);
  const participants = [...new Set(capped.map((h) => h.owner_id as string))];

  const { data: inserted } = await admin
    .from('guild_raid_runs')
    .insert({
      guild_id: guild.id,
      raid_type_id: raid.id,
      started_by_player_id: participants[0],
      hero_ids: capped.map((h) => h.id),
      participant_player_ids: participants,
      seed,
      result: { fight_results: run.fightResults, loot: run.lootRolled },
      success: run.success,
      reached_index: run.reachedIndex,
    })
    .select('id')
    .single();

  const lootMap: Record<string, number> = {};
  for (const drop of run.lootRolled) lootMap[drop.resource] = drop.amount;
  for (const pid of participants) {
    const tier = await currentArcOf(admin, pid);
    await addResources(admin, pid, lootMap, tier);
  }

  const heroesByOwner = new Map<string, number>();
  for (const h of capped) heroesByOwner.set(h.owner_id, (heroesByOwner.get(h.owner_id) ?? 0) + 1);
  for (const [pid, cnt] of heroesByOwner) {
    const { data: mrow } = await admin
      .from('guild_members')
      .select('contribution, raids_joined')
      .eq('player_id', pid)
      .maybeSingle();
    await admin
      .from('guild_members')
      .update({
        contribution: (mrow?.contribution ?? 0) + guildContributionPoints(cnt, run.success),
        raids_joined: (mrow?.raids_joined ?? 0) + 1,
      })
      .eq('player_id', pid);
  }

  const gainXp = guildXpForRaid(run.success, run.reachedIndex, raid.monsterSequence.length);
  // Clear du niveau courant → on débloque le suivant (source des points de raid).
  const clearedNew = run.success && level > (guild.highest_raid_cleared ?? 0);
  const newHighest = clearedNew ? Math.min(MAX_RAID_LEVEL, level) : (guild.highest_raid_cleared ?? 0);
  await admin
    .from('guilds')
    .update({
      xp: (guild.xp ?? 0) + gainXp,
      last_raid_at: new Date().toISOString(),
      highest_raid_cleared: newHighest,
    })
    .eq('id', guild.id);
  await admin.from('guild_events').insert({
    guild_id: guild.id,
    kind: run.success ? 'raid_clear' : 'raid_fail',
    actor_player_id: null,
    message: run.success
      ? `Raid du soir : ${raid.name} niveau ${level} vaincu !${clearedNew ? ' (+1 point de guilde)' : ''}`
      : `Raid du soir : ${raid.name} niveau ${level} — échec vague ${run.reachedIndex + 1}`,
    meta: { run_id: inserted?.id ?? null, xp: gainXp, auto: true, level },
  });
  return true;
}

/** Résout le raid du soir de TOUTES les guildes (appel cron). */
async function autoResolveAllGuilds(admin: Admin): Promise<number> {
  const { data: guilds } = await admin
    .from('guilds')
    .select('id, name, xp, last_raid_at, highest_raid_cleared, skill_alloc');
  let count = 0;
  for (const g of guilds ?? []) {
    try {
      if (await resolveRaidForGuild(admin, g)) count += 1;
    } catch (_) {
      /* une guilde en échec ne bloque pas les autres */
    }
  }
  return count;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: 'Config serveur manquante' }, 500);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: 'Corps invalide' }, 400);
  }

  const admin: Admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // ------------------------------------------------- CRON : résolution auto 20h
  // Appelée par pg_cron via pg_net (aucun utilisateur). Protégée par un secret
  // partagé stocké dans app_config (lisible service_role uniquement).
  if (body.action === 'run_auto') {
    const secret = req.headers.get('x-raid-secret');
    const { data: cfg } = await admin
      .from('app_config')
      .select('value')
      .eq('key', 'raid_cron_secret')
      .maybeSingle();
    if (!secret || !cfg || secret !== cfg.value) return json({ error: 'Interdit' }, 403);
    const resolved = await autoResolveAllGuilds(admin);
    return json({ resolved });
  }

  // ---------------------------------------------------------- Auth utilisateur
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Non authentifié' }, 401);
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: 'Session invalide' }, 401);

  const me = await membershipOf(admin, user.id);
  if (!me) return json({ error: "Tu n'es dans aucune guilde" }, 400);

  // ----------------------------------------------------------------- ENROLL
  // Inscription persistante au raid du soir (max 2 héros, dispo indépendante).
  if (body.action === 'enroll') {
    const heroIds = body.hero_ids;
    if (!Array.isArray(heroIds) || heroIds.some((h) => typeof h !== 'string')) {
      return json({ error: 'hero_ids invalide' }, 400);
    }
    const unique = [...new Set(heroIds as string[])].slice(0, MAX_ENROLLED_HEROES);
    if (unique.length > 0) {
      const { data: owned } = await admin
        .from('heroes')
        .select('id')
        .in('id', unique)
        .eq('owner_id', user.id);
      if (!owned || owned.length !== unique.length) return json({ error: 'Héros non possédés' }, 403);
      await admin.from('guild_raid_enrollments').upsert(
        { player_id: user.id, guild_id: me.guild_id, hero_ids: unique, updated_at: new Date().toISOString() },
        { onConflict: 'player_id' },
      );
    } else {
      await admin.from('guild_raid_enrollments').delete().eq('player_id', user.id);
    }
    return json({ ok: true, hero_ids: unique });
  }

  // ----------------------------------------------------------- CREATE LOBBY
  if (body.action === 'create_lobby') {
    if (!canStartRaid(me.role)) return json({ error: 'Réservé aux officiers/fondateur' }, 403);
    if (typeof body.raid_type_id !== 'string') return json({ error: 'raid_type_id invalide' }, 400);

    const { data: guild } = await admin
      .from('guilds')
      .select('id, xp, last_raid_at')
      .eq('id', me.guild_id)
      .single();
    if (!guild) return json({ error: 'Guilde introuvable' }, 404);

    const { data: raid } = await admin
      .from('guild_raid_types')
      .select('id, tier, required_guild_level')
      .eq('id', body.raid_type_id)
      .single();
    if (!raid) return json({ error: 'Raid introuvable' }, 404);
    if (guildLevel(guild.xp) < raid.required_guild_level) {
      return json({ error: `Niveau de guilde ${raid.required_guild_level} requis` }, 403);
    }

    // Cooldown lié à la difficulté du raid visé.
    const lastMs = guild.last_raid_at ? new Date(guild.last_raid_at).getTime() : null;
    const cd = raidCooldownRemaining(lastMs, raid.tier ?? 1, Date.now());
    if (cd > 0) return json({ error: `Raid en cooldown (${Math.ceil(cd / 3600)} h)` }, 429);

    const { data: openLobby } = await admin
      .from('guild_raid_lobbies')
      .select('id')
      .eq('guild_id', me.guild_id)
      .eq('status', 'open')
      .maybeSingle();
    if (openLobby) return json({ error: 'Un lobby est déjà ouvert' }, 409);

    const expiresAt = new Date(Date.now() + LOBBY_TTL_SECONDS * 1000).toISOString();
    const { data: lobby, error } = await admin
      .from('guild_raid_lobbies')
      .insert({ guild_id: me.guild_id, raid_type_id: raid.id, created_by_player_id: user.id, expires_at: expiresAt })
      .select('id')
      .single();
    if (error || !lobby) return json({ error: 'Création du lobby impossible' }, 500);
    return json({ lobby_id: lobby.id });
  }

  // ------------------------------------------------------------- CONTRIBUTE
  if (body.action === 'contribute') {
    if (typeof body.lobby_id !== 'string') return json({ error: 'lobby_id invalide' }, 400);
    const heroIds = body.hero_ids;
    if (!Array.isArray(heroIds) || heroIds.some((h) => typeof h !== 'string')) {
      return json({ error: 'hero_ids invalide' }, 400);
    }
    const unique = [...new Set(heroIds as string[])];

    const { data: lobby } = await admin
      .from('guild_raid_lobbies')
      .select('id, guild_id, status')
      .eq('id', body.lobby_id)
      .single();
    if (!lobby || lobby.guild_id !== me.guild_id) return json({ error: 'Lobby introuvable' }, 404);
    if (lobby.status !== 'open') return json({ error: 'Lobby fermé' }, 400);

    if (unique.length > 0) {
      const { data: owned } = await admin
        .from('heroes')
        .select('id')
        .in('id', unique)
        .eq('owner_id', user.id);
      if (!owned || owned.length !== unique.length) return json({ error: 'Héros non possédés' }, 403);
    }

    await admin
      .from('guild_raid_contributions')
      .upsert(
        { lobby_id: lobby.id, guild_id: me.guild_id, player_id: user.id, hero_ids: unique },
        { onConflict: 'lobby_id,player_id' },
      );
    return json({ ok: true });
  }

  // --------------------------------------------------------------- WITHDRAW
  if (body.action === 'withdraw') {
    if (typeof body.lobby_id !== 'string') return json({ error: 'lobby_id invalide' }, 400);
    await admin
      .from('guild_raid_contributions')
      .delete()
      .eq('lobby_id', body.lobby_id)
      .eq('player_id', user.id);
    return json({ ok: true });
  }

  // ----------------------------------------------------------------- CANCEL
  if (body.action === 'cancel') {
    if (typeof body.lobby_id !== 'string') return json({ error: 'lobby_id invalide' }, 400);
    if (!canStartRaid(me.role)) return json({ error: 'Droits insuffisants' }, 403);
    await admin
      .from('guild_raid_lobbies')
      .update({ status: 'cancelled' })
      .eq('id', body.lobby_id)
      .eq('guild_id', me.guild_id)
      .eq('status', 'open');
    return json({ ok: true });
  }

  // ---------------------------------------------------------------- RESOLVE
  if (body.action === 'resolve') {
    if (typeof body.lobby_id !== 'string') return json({ error: 'lobby_id invalide' }, 400);
    if (!canStartRaid(me.role)) return json({ error: 'Réservé aux officiers/fondateur' }, 403);

    const { data: lobby } = await admin
      .from('guild_raid_lobbies')
      .select('id, guild_id, raid_type_id, status')
      .eq('id', body.lobby_id)
      .single();
    if (!lobby || lobby.guild_id !== me.guild_id) return json({ error: 'Lobby introuvable' }, 404);
    if (lobby.status !== 'open') return json({ error: 'Lobby déjà résolu/annulé' }, 400);

    const { data: guild } = await admin
      .from('guilds')
      .select('id, xp, last_raid_at, highest_raid_cleared, skill_alloc')
      .eq('id', me.guild_id)
      .single();
    if (!guild) return json({ error: 'Guilde introuvable' }, 404);

    const { data: raidRow } = await admin
      .from('guild_raid_types')
      .select('*')
      .eq('id', lobby.raid_type_id)
      .single();
    if (!raidRow) return json({ error: 'Raid introuvable' }, 404);
    // Niveau progressif + scaling + buff de guilde (même logique que l'auto).
    const level = nextRaidLevel(guild.highest_raid_cleared ?? 0);
    const raid = scaleRaidEnemies(toDungeonType(raidRow), raidDifficultyMult(level));
    const buff = combatBuff((guild.skill_alloc ?? {}) as GuildAlloc);

    // Cooldown guilde (re-check), lié à la difficulté du raid.
    const lastMs = guild.last_raid_at ? new Date(guild.last_raid_at).getTime() : null;
    if (raidCooldownRemaining(lastMs, raid.tier, Date.now()) > 0) {
      return json({ error: 'Raid en cooldown' }, 429);
    }

    // Agrège les héros engagés par les membres.
    const { data: contribs } = await admin
      .from('guild_raid_contributions')
      .select('player_id, hero_ids')
      .eq('lobby_id', lobby.id);
    const allHeroIds = [...new Set((contribs ?? []).flatMap((c: { hero_ids: string[] }) => c.hero_ids ?? []))];
    if (allHeroIds.length === 0) return json({ error: 'Aucun héros engagé' }, 400);

    // Membres de la guilde (les héros doivent appartenir à des membres).
    const { data: members } = await admin.from('guild_members').select('player_id').eq('guild_id', me.guild_id);
    const memberIds = new Set((members ?? []).map((m: { player_id: string }) => m.player_id));

    const { data: heroRows } = await admin.from('heroes').select(HERO_SELECT).in('id', allHeroIds);
    const engaged = await engagedInActivity(admin);

    // Ne garde que les héros de membres, disponibles.
    // deno-lint-ignore no-explicit-any
    const usable = (heroRows ?? []).filter(
      (h: any) => memberIds.has(h.owner_id) && !engaged.has(h.id),
    );
    if (usable.length < raidRow.min_heroes) {
      return json({ error: `Il faut au moins ${raidRow.min_heroes} héros disponibles` }, 400);
    }
    // deno-lint-ignore no-explicit-any
    const capped = usable.slice(0, Math.min(raidRow.max_heroes, MAX_RAID_HEROES)) as any[];

    // Snapshots (chemin unique) + escouade, buffés par l'arbre de guilde.
    const snapshotById = new Map<string, CombatantInput>(
      capped.map((h) => [h.id, buildHeroSnapshot(toSnapshotInput(h), buff)]),
    );
    const squad: CombatantInput[] = capped.map((h) => snapshotById.get(h.id)!);

    // Seed serveur + simulation (réutilise le moteur de donjon).
    const seed = Math.floor(Math.random() * 2_147_483_647);
    const run = simulateDungeonRun(seed, squad, raid);

    // Participants = propriétaires distincts des héros utilisés.
    const participants = [...new Set(capped.map((h) => h.owner_id as string))];

    // RÉSOLUTION ATOMIQUE (anti multi-onglets) : le loot d'un raid est PARTAGÉ et
    // crédité à CHAQUE participant → une double résolution du même lobby doublerait
    // les gains de toute la guilde. Juste avant d'écrire quoi que ce soit, on
    // s'approprie le lobby en flippant open → resolved en une requête conditionnelle.
    // Deux requêtes concurrentes : une seule voit l'UPDATE affecter 1 ligne
    // (Postgres sérialise la ligne), l'autre → 409, sans rien créditer. Placé APRÈS
    // les validations (héros dispo, etc.) pour ne pas « consommer » un lobby sur erreur.
    const { data: claimedLobby } = await admin
      .from('guild_raid_lobbies')
      .update({ status: 'resolved' })
      .eq('id', lobby.id)
      .eq('status', 'open')
      .select('id');
    if (!claimedLobby || claimedLobby.length === 0) {
      return json({ error: 'Lobby déjà résolu' }, 409);
    }

    // Persistance du run.
    const { data: inserted } = await admin
      .from('guild_raid_runs')
      .insert({
        guild_id: me.guild_id,
        raid_type_id: raid.id,
        started_by_player_id: user.id,
        hero_ids: capped.map((h) => h.id),
        participant_player_ids: participants,
        seed,
        result: { fight_results: run.fightResults, loot: run.lootRolled },
        success: run.success,
        reached_index: run.reachedIndex,
      })
      .select('id')
      .single();

    // Journalise les emprunts (héros des AUTRES membres) via hero_loans 'raid'.
    for (const h of capped) {
      if (h.owner_id === user.id) continue;
      await admin.from('hero_loans').insert({
        owner_player_id: h.owner_id,
        hero_id: h.id,
        borrower_player_id: user.id,
        hero_snapshot: snapshotById.get(h.id),
        activity_type: 'raid',
        activity_id: inserted?.id ?? null,
        expires_at: new Date().toISOString(),
      });
    }

    // Loot PARTAGÉ : le même butin crédité à chaque participant, au tier de SON arc.
    const lootMap: Record<string, number> = {};
    for (const drop of run.lootRolled) lootMap[drop.resource] = drop.amount;
    for (const pid of participants) {
      const tier = await currentArcOf(admin, pid);
      await addResources(admin, pid, lootMap, tier);
    }

    // Contribution par membre (selon ses héros utilisés) + raids_joined.
    const heroesByOwner = new Map<string, number>();
    for (const h of capped) heroesByOwner.set(h.owner_id, (heroesByOwner.get(h.owner_id) ?? 0) + 1);
    for (const [pid, count] of heroesByOwner) {
      const { data: mrow } = await admin
        .from('guild_members')
        .select('contribution, raids_joined')
        .eq('player_id', pid)
        .maybeSingle();
      await admin
        .from('guild_members')
        .update({
          contribution: (mrow?.contribution ?? 0) + guildContributionPoints(count, run.success),
          raids_joined: (mrow?.raids_joined ?? 0) + 1,
        })
        .eq('player_id', pid);
    }

    // XP de guilde + cooldown + progression du niveau de raid.
    const gainXp = guildXpForRaid(run.success, run.reachedIndex, raid.monsterSequence.length);
    const clearedNew = run.success && level > (guild.highest_raid_cleared ?? 0);
    const newHighest = clearedNew ? Math.min(MAX_RAID_LEVEL, level) : (guild.highest_raid_cleared ?? 0);
    await admin
      .from('guilds')
      .update({
        xp: (guild.xp ?? 0) + gainXp,
        last_raid_at: new Date().toISOString(),
        highest_raid_cleared: newHighest,
      })
      .eq('id', me.guild_id);

    // (Le lobby a déjà été passé à 'resolved' atomiquement en tête de résolution.)
    await admin.from('guild_events').insert({
      guild_id: me.guild_id,
      kind: run.success ? 'raid_clear' : 'raid_fail',
      actor_player_id: user.id,
      message: run.success
        ? `${raid.name} niveau ${level} vaincu !${clearedNew ? ' (+1 point de guilde)' : ''}`
        : `${raid.name} niveau ${level} — échec vague ${run.reachedIndex + 1}`,
      meta: { run_id: inserted?.id ?? null, xp: gainXp, level },
    });

    return json({
      run_id: inserted?.id ?? null,
      success: run.success,
      reached_index: run.reachedIndex,
      seed,
      level,
      cleared_new: clearedNew,
      raid: { id: raid.id, name: raid.name },
      fight_results: run.fightResults,
      loot: run.lootRolled,
      guild_xp_gained: gainXp,
    });
  }

  return json({ error: 'Action inconnue' }, 400);
});
