// Edge Function : arc-event
// Event de boss d'arc COMMUNAUTAIRE (« La Cloche du Désespoir »), Phase 3.
//
// Un boss à PV PARTAGÉS est invoqué quand assez de joueurs ont fini la carte du
// monde de l'arc 1. Chaque éligible peut le FRAPPER 1×/jour (vrai combat serveur) :
// les dégâts sont versés au pool commun. Sa mort — ou l'échéance (KILL GARANTI) —
// ouvre l'arc suivant POUR TOUT LE SERVEUR (arc_world.opened) et débloque
// player_arc.max_arc de tous les éligibles.
//
// Anti-triche : tout le combat est résolu côté serveur avec une seed serveur ; le
// client n'envoie que ses hero_ids (héros possédés uniquement). Aucune écriture
// client sur les tables de l'event — seule cette fonction (service_role) écrit.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { resolveCombat } from '@shared/combat/index.ts';
import type { CombatantInput } from '@shared/combat/index.ts';
import { buildHeroSnapshot, type HeroSnapshotInput } from '@shared/progression/heroLoan.ts';
import { computeSetBonuses } from '@shared/progression/sets.ts';
import {
  combatBuff,
  NO_COMBAT_BUFF,
  type GuildAlloc,
  type GuildCombatBuff,
} from '@shared/progression/guildSkills.ts';
import {
  ARC_EVENT_BELL_THRESHOLD,
  ARC_EVENT_WINDOW_DAYS,
  ARC_BOSS_NAME,
  arcBossHp,
  arcBossFightCombatant,
} from '@shared/progression/arcEvent.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TARGET_ARC = 2;
const MAX_TEAM = 5;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// deno-lint-ignore no-explicit-any
type Admin = any;

/** Date du jour 'YYYY-MM-DD' au fuseau Europe/Paris (indépendant de l'horloge client). */
function parisToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
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
    setIds: [h.weapon?.set_id, h.armor?.set_id, h.jewel?.set_id, h.relic?.set_id],
  };
}

/** Buff de combat de l'arbre de guilde de l'appelant (neutre si sans guilde). */
async function guildBuffOf(admin: Admin, userId: string): Promise<GuildCombatBuff> {
  const { data: mem } = await admin
    .from('guild_members')
    .select('guild_id')
    .eq('player_id', userId)
    .maybeSingle();
  if (!mem?.guild_id) return NO_COMBAT_BUFF;
  const { data: g } = await admin.from('guilds').select('skill_alloc').eq('id', mem.guild_id).single();
  return combatBuff((g?.skill_alloc ?? {}) as GuildAlloc);
}

/**
 * `level_id` du BOSS FINAL de la carte du monde (arc 1) : le niveau `is_boss=true`
 * de la `maps` de plus grand `sort`. Sert de barrière d'éligibilité à l'event.
 * `null` si la carte est mal configurée.
 */
async function finalBossLevelId(admin: Admin): Promise<string | null> {
  const { data: lastMap } = await admin
    .from('maps')
    .select('id')
    .order('sort', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!lastMap?.id) return null;
  const { data: boss } = await admin
    .from('levels')
    .select('id')
    .eq('map_id', lastMap.id)
    .eq('is_boss', true)
    .limit(1)
    .maybeSingle();
  return (boss?.id as string | undefined) ?? null;
}

/**
 * Nombre de joueurs DISTINCTS éligibles = ceux ayant une ligne `level_progress`
 * (arc=1) sur le boss final. La PK (player_id, level_id, arc) garantit au plus une
 * ligne par joueur → le compte de lignes = compte distinct.
 */
async function eligibleCount(admin: Admin, bossLevelId: string): Promise<number> {
  const { count } = await admin
    .from('level_progress')
    .select('player_id', { count: 'exact', head: true })
    .eq('level_id', bossLevelId)
    .eq('arc', 1);
  return count ?? 0;
}

/** L'appelant a-t-il vaincu le boss final (arc 1) ? */
async function isEligible(admin: Admin, userId: string, bossLevelId: string): Promise<boolean> {
  const { data } = await admin
    .from('level_progress')
    .select('level_id')
    .eq('player_id', userId)
    .eq('level_id', bossLevelId)
    .eq('arc', 1)
    .maybeSingle();
  return !!data;
}

/** Event ACTIF pour l'arc cible (au plus un, cf. index partiel unique), ou null. */
async function activeEvent(admin: Admin): Promise<Record<string, unknown> | null> {
  const { data } = await admin
    .from('arc_events')
    .select('*')
    .eq('target_arc', TARGET_ARC)
    .eq('status', 'active')
    .maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

/** Event COURANT : l'actif s'il existe, sinon le plus récent (pour l'affichage). */
async function currentEvent(admin: Admin): Promise<Record<string, unknown> | null> {
  const active = await activeEvent(admin);
  if (active) return active;
  const { data } = await admin
    .from('arc_events')
    .select('*')
    .eq('target_arc', TARGET_ARC)
    .order('summoned_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

/** L'arc cible est-il ouvert (arc_world.opened) ? */
async function arcOpen(admin: Admin): Promise<boolean> {
  const { data } = await admin
    .from('arc_world')
    .select('opened')
    .eq('arc', TARGET_ARC)
    .maybeSingle();
  return !!data?.opened;
}

/**
 * Classement : top 10 par SOMME(damage) groupée par joueur sur l'event donné,
 * joint au nom d'affichage (profiles.display_name). Agrégation en mémoire (peu de
 * lignes : au plus 1 frappe/joueur/jour sur une fenêtre de quelques jours).
 */
async function leaderboard(
  admin: Admin,
  eventId: string,
): Promise<{ player_id: string; name: string; damage: number }[]> {
  const { data: hits } = await admin
    .from('arc_event_hits')
    .select('player_id, damage')
    .eq('event_id', eventId);
  const byPlayer = new Map<string, number>();
  for (const h of hits ?? []) {
    const pid = h.player_id as string;
    byPlayer.set(pid, (byPlayer.get(pid) ?? 0) + Number(h.damage ?? 0));
  }
  const top = [...byPlayer.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  if (top.length === 0) return [];
  const { data: profs } = await admin
    .from('profiles')
    .select('id, display_name')
    .in('id', top.map(([pid]) => pid));
  const names = new Map<string, string>();
  for (const p of profs ?? []) names.set(p.id as string, (p.display_name as string) ?? 'Joueur');
  return top.map(([pid, damage]) => ({ player_id: pid, name: names.get(pid) ?? 'Joueur', damage }));
}

/**
 * Termine l'event : status 'defeated', ouvre l'arc pour TOUT le serveur
 * (arc_world) et débloque player_arc.max_arc de chaque joueur éligible.
 */
async function defeat(admin: Admin, event: Record<string, unknown>, bossLevelId: string | null): Promise<void> {
  const nowIso = new Date().toISOString();
  const targetArc = (event.target_arc as number) ?? TARGET_ARC;
  await admin
    .from('arc_events')
    .update({ status: 'defeated', defeated_at: nowIso })
    .eq('id', event.id as string);

  await admin
    .from('arc_world')
    .upsert({ arc: targetArc, opened: true, opened_at: nowIso }, { onConflict: 'arc' });

  // Débloque max_arc de tous les éligibles (retardataires inclus : ils entreront
  // dès qu'ils auront fini la carte, mais on couvre ici tous les déjà-éligibles).
  if (!bossLevelId) return;
  const { data: eligibles } = await admin
    .from('level_progress')
    .select('player_id')
    .eq('level_id', bossLevelId)
    .eq('arc', 1);
  const playerIds = [...new Set((eligibles ?? []).map((r: { player_id: string }) => r.player_id))];
  if (playerIds.length === 0) return;

  // max_arc = GREATEST(existant, target_arc) ; current_arc conservé (défaut 1).
  const { data: existingRows } = await admin
    .from('player_arc')
    .select('player_id, current_arc, max_arc')
    .in('player_id', playerIds);
  const existing = new Map<string, { current_arc: number; max_arc: number }>();
  for (const r of existingRows ?? []) {
    existing.set(r.player_id as string, {
      current_arc: (r.current_arc as number) ?? 1,
      max_arc: (r.max_arc as number) ?? 1,
    });
  }
  const upserts = playerIds.map((pid) => {
    const prev = existing.get(pid as string);
    return {
      player_id: pid,
      current_arc: prev?.current_arc ?? 1,
      max_arc: Math.max(prev?.max_arc ?? 1, targetArc),
    };
  });
  await admin.from('player_arc').upsert(upserts, { onConflict: 'player_id' });
}

/**
 * KILL GARANTI : si un event actif a dépassé son échéance, on le termine (l'arc
 * s'ouvre quoi qu'il arrive). Renvoie true si un event a été défait ici.
 */
async function applyKillGuarantee(admin: Admin, bossLevelId: string | null): Promise<boolean> {
  const active = await activeEvent(admin);
  if (!active) return false;
  if (Date.now() > new Date(active.deadline as string).getTime()) {
    await defeat(admin, active, bossLevelId);
    return true;
  }
  return false;
}

/** Sérialise une ligne arc_events pour la réponse (nombres castés depuis bigint). */
function serializeEvent(e: Record<string, unknown> | null) {
  if (!e) return null;
  return {
    id: e.id,
    status: e.status,
    boss_name: e.boss_name,
    hp_max: Number(e.hp_max),
    hp_current: Number(e.hp_current),
    eligible_count: Number(e.eligible_count),
    summoned_at: e.summoned_at,
    deadline: e.deadline,
    defeated_at: e.defeated_at ?? null,
  };
}

/**
 * Construit la réponse commune aux actions `state` et `summon` : event courant,
 * éligibilité de l'appelant, compteurs, possibilité d'invoquer, frappe du jour,
 * ouverture de l'arc et classement.
 */
async function buildState(admin: Admin, userId: string, bossLevelId: string | null) {
  const count = bossLevelId ? await eligibleCount(admin, bossLevelId) : 0;
  const eligible = bossLevelId ? await isEligible(admin, userId, bossLevelId) : false;
  const active = await activeEvent(admin);
  const event = await currentEvent(admin);

  let hitToday = false;
  if (active) {
    const { data: hit } = await admin
      .from('arc_event_hits')
      .select('player_id')
      .eq('event_id', active.id as string)
      .eq('player_id', userId)
      .eq('day', parisToday())
      .maybeSingle();
    hitToday = !!hit;
  }

  const board = event ? await leaderboard(admin, event.id as string) : [];
  const canSummon = !active && count >= ARC_EVENT_BELL_THRESHOLD && eligible;

  return {
    event: serializeEvent(event),
    eligible,
    eligible_count: count,
    can_summon: canSummon,
    hit_today: hitToday,
    arc2_open: await arcOpen(admin),
    leaderboard: board,
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

  let body: { action?: unknown; hero_ids?: unknown };
  try {
    body = (await req.json()) as { action?: unknown; hero_ids?: unknown };
  } catch {
    return json({ error: 'Corps de requête invalide' }, 400);
  }
  const action = body.action;

  const admin: Admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const bossLevelId = await finalBossLevelId(admin);

  // -------------------------------------------------------------------- STATE
  if (action === 'state') {
    await applyKillGuarantee(admin, bossLevelId);
    return json(await buildState(admin, user.id, bossLevelId));
  }

  // ------------------------------------------------------------------- SUMMON
  if (action === 'summon') {
    if (!bossLevelId) return json({ error: 'Carte du monde mal configurée' }, 500);
    // Garde-fou avant insertion (l'index partiel unique tranche les vraies races).
    if (await activeEvent(admin)) return json({ error: 'Un event est déjà en cours' }, 409);
    const count = await eligibleCount(admin, bossLevelId);
    if (count < ARC_EVENT_BELL_THRESHOLD) {
      return json({ error: `Il faut ${ARC_EVENT_BELL_THRESHOLD} héros ayant fini la carte` }, 403);
    }
    if (!(await isEligible(admin, user.id, bossLevelId))) {
      return json({ error: "Tu dois avoir fini la carte du monde pour sonner la cloche" }, 403);
    }

    const hp = arcBossHp(count);
    const deadline = new Date(Date.now() + ARC_EVENT_WINDOW_DAYS * 86_400_000).toISOString();
    const { error: insErr } = await admin.from('arc_events').insert({
      target_arc: TARGET_ARC,
      status: 'active',
      boss_name: ARC_BOSS_NAME,
      hp_max: hp,
      hp_current: hp,
      eligible_count: count,
      monster_sequence: [arcBossFightCombatant()],
      summoned_by: user.id,
      deadline,
    });
    if (insErr) {
      // Violation d'unicité (index partiel) → un autre appelant a invoqué en même temps.
      return json({ error: 'Un event est déjà en cours' }, 409);
    }
    return json(await buildState(admin, user.id, bossLevelId));
  }

  // ---------------------------------------------------------------------- HIT
  if (action === 'hit') {
    if (!bossLevelId) return json({ error: 'Carte du monde mal configurée' }, 500);

    // Kill garanti d'abord : si l'échéance est passée, on ferme l'event (pas de frappe).
    await applyKillGuarantee(admin, bossLevelId);

    const event = await activeEvent(admin);
    if (!event) return json({ error: 'Aucun event en cours' }, 409);
    if (!(await isEligible(admin, user.id, bossLevelId))) {
      return json({ error: "Tu dois avoir fini la carte du monde pour frapper" }, 403);
    }

    const heroIds = body.hero_ids;
    if (!Array.isArray(heroIds) || heroIds.some((h) => typeof h !== 'string')) {
      return json({ error: 'hero_ids invalide' }, 400);
    }
    const unique = [...new Set(heroIds as string[])];
    if (unique.length < 1 || unique.length > MAX_TEAM) {
      return json({ error: `Entre 1 et ${MAX_TEAM} héros` }, 400);
    }

    // Garde 1×/jour : l'INSERT de la ligne de frappe (PK event/joueur/jour) est le
    // verrou. En cas de conflit → déjà frappé aujourd'hui. On sème damage=0, mis à
    // jour après le combat.
    const today = parisToday();
    const { error: hitErr } = await admin.from('arc_event_hits').insert({
      event_id: event.id as string,
      player_id: user.id,
      day: today,
      damage: 0,
    });
    if (hitErr) return json({ error: 'Tu as déjà frappé aujourd’hui' }, 409);

    // Escouade : héros POSSÉDÉS uniquement (build live + buff de guilde).
    const { data: ownedRows } = await admin
      .from('heroes')
      .select(HERO_SELECT)
      .in('id', unique)
      .eq('owner_id', user.id);
    if (!ownedRows || ownedRows.length === 0) {
      return json({ error: 'Aucun héros valide' }, 400);
    }
    const buff = await guildBuffOf(admin, user.id);
    const snapshotById = new Map<string, CombatantInput>();
    // deno-lint-ignore no-explicit-any
    for (const h of ownedRows as any[]) {
      snapshotById.set(h.id, buildHeroSnapshot(toSnapshotInput(h), buff));
    }
    // Ordre stable = ordre demandé (héros possédés seulement).
    const squad = unique.map((id) => snapshotById.get(id)).filter((c): c is CombatantInput => Boolean(c));

    // Combat serveur unique contre le « sac de frappe » (seed serveur).
    const boss = arcBossFightCombatant();
    const seed = Math.floor(Math.random() * 2_147_483_647);
    const combat = resolveCombat({ allies: squad, enemies: [boss], seed });
    const bossFinal = combat.finalState.find((f) => f.id === boss.id);
    const damage = Math.max(0, boss.hp - (bossFinal?.hp ?? boss.hp));

    // Enregistre la contribution du joueur pour aujourd'hui.
    await admin
      .from('arc_event_hits')
      .update({ damage })
      .eq('event_id', event.id as string)
      .eq('player_id', user.id)
      .eq('day', today);

    // Décrément ATOMIQUE du pool commun (clamp à 0), gardé sur status='active'.
    // Compare-and-swap sur hp_current pour sérialiser les frappes concurrentes de
    // joueurs différents : on ne perd aucun dégât.
    let hpCurrent = Number(event.hp_current);
    let defeated = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const next = Math.max(0, hpCurrent - damage);
      const { data: swapped } = await admin
        .from('arc_events')
        .update({ hp_current: next })
        .eq('id', event.id as string)
        .eq('status', 'active')
        .eq('hp_current', hpCurrent)
        .select('hp_current');
      if (swapped && swapped.length > 0) {
        hpCurrent = next;
        defeated = next <= 0;
        break;
      }
      // Une autre frappe est passée entre-temps (ou l'event est clos) : on relit.
      const { data: fresh } = await admin
        .from('arc_events')
        .select('hp_current, status')
        .eq('id', event.id as string)
        .maybeSingle();
      if (!fresh || fresh.status !== 'active') {
        hpCurrent = Number(fresh?.hp_current ?? 0);
        defeated = hpCurrent <= 0;
        break;
      }
      hpCurrent = Number(fresh.hp_current);
    }

    if (defeated) {
      // On relit l'event (status peut avoir été mis à 0) puis on le termine.
      const { data: toKill } = await admin
        .from('arc_events')
        .select('*')
        .eq('id', event.id as string)
        .eq('status', 'active')
        .maybeSingle();
      if (toKill) await defeat(admin, toKill as Record<string, unknown>, bossLevelId);
    }

    return json({
      combat: {
        rounds: combat.rounds,
        result: combat.result,
        events: combat.events,
        final_state: combat.finalState,
      },
      damage,
      hp_current: hpCurrent,
      hp_max: Number(event.hp_max),
      defeated,
    });
  }

  return json({ error: 'Action inconnue' }, 400);
});
