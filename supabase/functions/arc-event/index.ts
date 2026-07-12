// Edge Function : arc-event
// Event de boss d'arc COMMUNAUTAIRE (« La Cloche du Désespoir »), version PHASÉE.
//
// Cycle de vie : la CLOCHE est sonnée (summon) → phase de PRÉPARATION
// (~ARC_EVENT_PREP_HOURS h, statut 'pending', « boss en approche ») → INVOCATION
// (statut 'active' : le boss apparaît, frappable) → FENÊTRE DE COMBAT
// (~ARC_EVENT_FIGHT_WINDOW_DAYS j). Chaque joueur peut FRAPPER toutes les
// ARC_EVENT_HIT_COOLDOWN_HOURS h (vrai combat serveur) : ses dégâts sont versés au
// pool commun. La mort du boss ouvre l'arc suivant POUR TOUT LE SERVEUR
// (arc_world.opened) et débloque player_arc.max_arc de tous les éligibles.
// Si l'échéance passe sans tuer le boss, il SE RETIRE (statut 'expired') : PLUS de
// kill garanti — il faut le tuer, sinon on re-sonne la cloche.
//
// Transitions appliquées LAZILY (advanceEvent) au début de `state` et `hit`.
//
// Anti-triche : tout le combat est résolu côté serveur avec une seed serveur et une
// horloge serveur ; le client n'envoie que ses hero_ids (héros possédés uniquement).
// Aucune écriture client sur les tables de l'event — seule cette fonction
// (service_role) écrit.

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
  ARC_EVENT_PREP_HOURS,
  ARC_EVENT_HIT_COOLDOWN_HOURS,
  ARC_EVENT_FIGHT_WINDOW_DAYS,
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
const PREP_MS = ARC_EVENT_PREP_HOURS * 3_600_000;
const FIGHT_WINDOW_MS = ARC_EVENT_FIGHT_WINDOW_DAYS * 86_400_000;
const HIT_COOLDOWN_MS = ARC_EVENT_HIT_COOLDOWN_HOURS * 3_600_000;

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

/** Event VIVANT (pending|active) pour l'arc cible (au plus un, cf. index partiel unique), ou null. */
async function liveEvent(admin: Admin): Promise<Record<string, unknown> | null> {
  const { data } = await admin
    .from('arc_events')
    .select('*')
    .eq('target_arc', TARGET_ARC)
    .in('status', ['pending', 'active'])
    .maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

/** Event COURANT : le vivant s'il existe, sinon le plus récent (pour l'affichage). */
async function currentEvent(admin: Admin): Promise<Record<string, unknown> | null> {
  const live = await liveEvent(admin);
  if (live) return live;
  const { data } = await admin
    .from('arc_events')
    .select('*')
    .eq('target_arc', TARGET_ARC)
    .order('summoned_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

/**
 * Applique LAZILY les transitions de phase à l'event vivant (horloge serveur) :
 *   - 'pending' + now >= invoke_at            → 'active' (le boss apparaît).
 *   - 'active'  + now > deadline + hp_current>0 → 'expired' (le boss se retire,
 *     ended_at=now ; PAS de kill garanti, l'arc ne s'ouvre pas).
 * Renvoie l'event vivant après transition (null si retiré / inexistant).
 */
async function advanceEvent(admin: Admin): Promise<Record<string, unknown> | null> {
  const ev = await liveEvent(admin);
  if (!ev) return null;
  const now = Date.now();

  if (ev.status === 'pending' && now >= new Date(ev.invoke_at as string).getTime()) {
    const { data } = await admin
      .from('arc_events')
      .update({ status: 'active' })
      .eq('id', ev.id as string)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle();
    return (data as Record<string, unknown> | null) ?? ev;
  }

  if (
    ev.status === 'active' &&
    now > new Date(ev.deadline as string).getTime() &&
    Number(ev.hp_current) > 0
  ) {
    const nowIso = new Date().toISOString();
    await admin
      .from('arc_events')
      .update({ status: 'expired', ended_at: nowIso })
      .eq('id', ev.id as string)
      .eq('status', 'active');
    return null; // plus vivant
  }

  return ev;
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

/** Instant de la DERNIÈRE frappe de l'appelant sur l'event (journal append-only), ou null. */
async function lastHitAt(admin: Admin, eventId: string, userId: string): Promise<Date | null> {
  const { data } = await admin
    .from('arc_event_hits')
    .select('created_at')
    .eq('event_id', eventId)
    .eq('player_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.created_at ? new Date(data.created_at as string) : null;
}

/**
 * Classement : top 10 par SOMME(damage) groupée par joueur sur l'event donné,
 * joint au nom d'affichage (profiles.display_name). Agrégation en mémoire.
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
 * Termine l'event : status 'defeated', defeated_at & ended_at = now, ouvre l'arc
 * pour TOUT le serveur (arc_world) et débloque player_arc.max_arc de chaque éligible.
 */
async function defeat(admin: Admin, event: Record<string, unknown>, bossLevelId: string | null): Promise<void> {
  const nowIso = new Date().toISOString();
  const targetArc = (event.target_arc as number) ?? TARGET_ARC;
  await admin
    .from('arc_events')
    .update({ status: 'defeated', defeated_at: nowIso, ended_at: nowIso })
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
    invoke_at: e.invoke_at,
    deadline: e.deadline,
    defeated_at: e.defeated_at ?? null,
    ended_at: e.ended_at ?? null,
  };
}

/**
 * Construit la réponse commune aux actions `state` et `summon` : event courant,
 * éligibilité de l'appelant, compteurs, possibilité d'invoquer, statut de frappe
 * (cooldown), ouverture de l'arc et classement. Suppose que les transitions ont déjà
 * été appliquées (advanceEvent) par l'appelant.
 */
async function buildState(admin: Admin, userId: string, bossLevelId: string | null) {
  const count = bossLevelId ? await eligibleCount(admin, bossLevelId) : 0;
  const eligible = bossLevelId ? await isEligible(admin, userId, bossLevelId) : false;
  const live = await liveEvent(admin);
  const event = live ?? (await currentEvent(admin));

  let canHitNow = false;
  let nextHitAt: string | null = null;
  if (live && live.status === 'active') {
    const last = await lastHitAt(admin, live.id as string, userId);
    if (!last) {
      canHitNow = true;
    } else {
      const next = new Date(last.getTime() + HIT_COOLDOWN_MS);
      if (Date.now() >= next.getTime()) {
        canHitNow = true;
      } else {
        nextHitAt = next.toISOString();
      }
    }
  }

  const board = event ? await leaderboard(admin, event.id as string) : [];
  const canSummon = !live && count >= ARC_EVENT_BELL_THRESHOLD && eligible;

  return {
    event: serializeEvent(event),
    eligible,
    eligible_count: count,
    can_summon: canSummon,
    can_hit_now: canHitNow,
    next_hit_at: nextHitAt,
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
    await advanceEvent(admin);
    return json(await buildState(admin, user.id, bossLevelId));
  }

  // ------------------------------------------------------------------- SUMMON
  if (action === 'summon') {
    if (!bossLevelId) return json({ error: 'Carte du monde mal configurée' }, 500);
    // Garde-fou avant insertion (l'index partiel unique tranche les vraies races).
    if (await liveEvent(admin)) return json({ error: 'Un event est déjà en cours' }, 409);
    const count = await eligibleCount(admin, bossLevelId);
    if (count < ARC_EVENT_BELL_THRESHOLD) {
      return json({ error: `Il faut ${ARC_EVENT_BELL_THRESHOLD} héros ayant fini la carte` }, 403);
    }
    if (!(await isEligible(admin, user.id, bossLevelId))) {
      return json({ error: "Tu dois avoir fini la carte du monde pour sonner la cloche" }, 403);
    }

    const hp = arcBossHp(count);
    const invokeAt = new Date(Date.now() + PREP_MS);
    const deadline = new Date(invokeAt.getTime() + FIGHT_WINDOW_MS);
    const { error: insErr } = await admin.from('arc_events').insert({
      target_arc: TARGET_ARC,
      status: 'pending',
      boss_name: ARC_BOSS_NAME,
      hp_max: hp,
      hp_current: hp,
      eligible_count: count,
      monster_sequence: [arcBossFightCombatant()],
      summoned_by: user.id,
      invoke_at: invokeAt.toISOString(),
      deadline: deadline.toISOString(),
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

    // Transitions d'abord (le boss apparaît / se retire selon l'horloge serveur).
    await advanceEvent(admin);

    const event = await liveEvent(admin);
    if (!event) return json({ error: 'Aucun combat en cours' }, 409);
    if (event.status !== 'active') {
      return json({ error: "Le boss n'est pas encore invoqué" }, 409);
    }
    // TOUT le serveur peut frapper (pas de gate d'éligibilité) : les PV sont calés
    // sur les éligibles, et les non-éligibles (escouades faibles) ont un impact minime.

    // Cooldown : dernière frappe de l'appelant sur cet event.
    const last = await lastHitAt(admin, event.id as string, user.id);
    if (last) {
      const next = new Date(last.getTime() + HIT_COOLDOWN_MS);
      if (Date.now() < next.getTime()) {
        return json(
          {
            error: `Tu dois attendre ${ARC_EVENT_HIT_COOLDOWN_HOURS} h entre deux frappes`,
            next_hit_at: next.toISOString(),
          },
          409,
        );
      }
    }

    const heroIds = body.hero_ids;
    if (!Array.isArray(heroIds) || heroIds.some((h) => typeof h !== 'string')) {
      return json({ error: 'hero_ids invalide' }, 400);
    }
    const unique = [...new Set(heroIds as string[])];
    if (unique.length < 1 || unique.length > MAX_TEAM) {
      return json({ error: `Entre 1 et ${MAX_TEAM} héros` }, 400);
    }

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
    // CONTRIBUTION = dégâts réellement infligés = PV max EFFECTIFS − PV restants.
    // (Le moteur scale les PV ennemis ×MONSTER_HP_SCALE en interne : on lit donc le
    // maxHp du finalState, pas la valeur d'entrée `boss.hp`, sinon damage = 0.)
    const damage = Math.max(0, (bossFinal?.maxHp ?? 0) - (bossFinal?.hp ?? 0));

    // Journal append-only : une nouvelle ligne de contribution (id par défaut).
    await admin.from('arc_event_hits').insert({
      event_id: event.id as string,
      player_id: user.id,
      damage,
      created_at: new Date().toISOString(),
    });

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
