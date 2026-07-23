// Edge Function : newbie-event
// Event du NOUVEAU JOUEUR (Arc 1). Actions :
//  - state           : ouvre l'event au 1er appel (compte encore en Arc 1),
//                      renvoie la progression des objectifs, le %, les paliers
//                      et ce qui est déjà réclamé.
//  - claim_objective : réclame la récompense d'UN objectif atteint (choix
//                      d'équipement/relique/héros selon le cas).
//  - claim_milestone : réclame la récompense d'un palier (%) atteint.
//
// Comptage « pendant la fenêtre » via les horodatages ; réclamation atomisée
// par compare-and-swap sur les tableaux claimed_*. Tous les dons passent par
// les mêmes primitives que la forge / les codes / la taverne.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  NEWBIE_EVENT_DURATION_DAYS,
  NEWBIE_EXPEDITION_SIGNATURE_RESOURCE,
  evaluateObjectives,
  objectiveProgress,
  overallPct,
  milestonesReached,
  eventActive,
  resolveRewardZone,
  rewardChoice,
  objectiveById,
  milestoneByPct,
  type NewbieSignals,
  type NewbieReward,
} from '@shared/progression/newbieEvent.ts';
import { getBase, craftItemAtRarity, weaponPassiveFor } from '@shared/progression/forge.ts';
import { getRelicBase, craftRelicAtRarity } from '@shared/progression/relic.ts';
import { forgeMaterialsForArc, zoneBossMaterialForArc, resourceTier } from '@shared/progression/arcMaterials.ts';
import { tierGearMult } from '@shared/progression/arc.ts';
import { ROLL_MAX, rollRecruitName, hashSeed } from '@shared/progression/recruit.ts';
import { createRng } from '@shared/combat/prng.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// deno-lint-ignore no-explicit-any
type Admin = any;
// deno-lint-ignore no-explicit-any
type Choice = any;
const DAY_MS = 86_400_000;
const DAILY_RARITY = 'ultimate' as const;

type EventRow = {
  starts_at: string;
  ends_at: string;
  pantin_baseline: number;
  claimed_objectives: string[];
  claimed_milestones: number[];
};

/* ------------------------------------------------------------ lectures --- */

async function playerArcOf(admin: Admin, userId: string): Promise<{ current: number; max: number }> {
  const { data } = await admin.from('player_arc').select('current_arc, max_arc').eq('player_id', userId).maybeSingle();
  return {
    current: Math.max(1, (data?.current_arc as number | undefined) ?? 1),
    max: Math.max(1, (data?.max_arc as number | undefined) ?? 1),
  };
}

/** Zone (maps.sort) la plus loin atteinte dans l'arc (0 → 1 par défaut). */
async function furthestZoneOf(admin: Admin, userId: string, arc: number): Promise<number> {
  const { data: cleared } = await admin
    .from('level_progress')
    .select('level_id')
    .eq('player_id', userId)
    .eq('arc', arc);
  const ids = (cleared ?? []).map((r: { level_id: string }) => r.level_id);
  if (ids.length === 0) return 1;
  const { data: levels } = await admin.from('levels').select('map_id').in('id', ids);
  const mapIds = [...new Set((levels ?? []).map((l: { map_id: string }) => l.map_id as string))];
  if (mapIds.length === 0) return 1;
  const { data: maps } = await admin.from('maps').select('sort').in('id', mapIds);
  const sorts = (maps ?? []).map((m: { sort: number | null }) => m.sort ?? 1);
  return sorts.length ? Math.max(1, ...sorts) : 1;
}

/** N° de zones dont le boss est tombé dans [starts_at, ends_at), Arc 1. */
async function bossZonesCleared(admin: Admin, userId: string, ev: EventRow): Promise<number[]> {
  const { data: cleared } = await admin
    .from('level_progress')
    .select('level_id')
    .eq('player_id', userId)
    .eq('arc', 1)
    .gte('cleared_at', ev.starts_at)
    .lt('cleared_at', ev.ends_at);
  const ids = (cleared ?? []).map((r: { level_id: string }) => r.level_id);
  if (ids.length === 0) return [];
  const { data: bossLevels } = await admin.from('levels').select('map_id').in('id', ids).eq('is_boss', true);
  const mapIds = [...new Set((bossLevels ?? []).map((l: { map_id: string }) => l.map_id as string))];
  if (mapIds.length === 0) return [];
  const { data: maps } = await admin.from('maps').select('sort').in('id', mapIds);
  return [...new Set((maps ?? []).map((m: { sort: number }) => m.sort))];
}

async function dungeonTiersCleared(admin: Admin, userId: string, ev: EventRow): Promise<number[]> {
  const { data: runs } = await admin
    .from('dungeon_runs')
    .select('dungeon_type_id')
    .eq('player_id', userId)
    .eq('arc', 1)
    .eq('success', true)
    .gte('created_at', ev.starts_at)
    .lt('created_at', ev.ends_at);
  const typeIds = [...new Set((runs ?? []).map((r: { dungeon_type_id: string }) => r.dungeon_type_id as string))];
  if (typeIds.length === 0) return [];
  const { data: types } = await admin.from('dungeon_types').select('tier').in('id', typeIds);
  return [...new Set((types ?? []).map((t: { tier: number }) => t.tier))];
}

async function expeditionTypesClaimed(admin: Admin, userId: string, ev: EventRow): Promise<string[]> {
  const { data } = await admin
    .from('expedition_runs')
    .select('expedition_type_id')
    .eq('player_id', userId)
    .eq('status', 'claimed')
    .gte('claimed_at', ev.starts_at)
    .lt('claimed_at', ev.ends_at);
  return [...new Set((data ?? []).map((r: { expedition_type_id: string }) => r.expedition_type_id as string))];
}

async function towerFloors(admin: Admin, userId: string): Promise<{ light: number; medium: number; heavy: number }> {
  const { data } = await admin
    .from('weight_tower_progress')
    .select('weight, best_floor')
    .eq('player_id', userId)
    .eq('arc', 1);
  const out = { light: 0, medium: 0, heavy: 0 } as Record<string, number>;
  for (const r of data ?? []) out[r.weight as string] = (r.best_floor as number) ?? 0;
  return { light: out.light, medium: out.medium, heavy: out.heavy };
}

async function joinedGuildInWindow(admin: Admin, userId: string, ev: EventRow): Promise<boolean> {
  const { data } = await admin
    .from('guild_members')
    .select('joined_at')
    .eq('player_id', userId)
    .gte('joined_at', ev.starts_at)
    .lt('joined_at', ev.ends_at)
    .maybeSingle();
  return Boolean(data);
}

/** Rassemble tous les signaux fenêtrés. */
async function gatherSignals(admin: Admin, userId: string, ev: EventRow): Promise<NewbieSignals> {
  const [zones, tiers, expTypes, floors, pantinRow, inGuild] = await Promise.all([
    bossZonesCleared(admin, userId, ev),
    dungeonTiersCleared(admin, userId, ev),
    expeditionTypesClaimed(admin, userId, ev),
    towerFloors(admin, userId),
    admin.from('pantin_runs').select('days_done').eq('player_id', userId).maybeSingle(),
    joinedGuildInWindow(admin, userId, ev),
  ]);
  const pantinDaysNow = (pantinRow.data?.days_done as number | undefined) ?? 0;
  return {
    bossZonesCleared: zones,
    dungeonTiersCleared: tiers,
    expeditionTypesClaimed: expTypes,
    pantinDaysInWindow: Math.max(0, pantinDaysNow - ev.pantin_baseline),
    towerFloorsByWeight: floors,
    inGuild,
  };
}

/* ------------------------------------------------------------- dons ------- */

async function creditGold(admin: Admin, userId: string, amount: number): Promise<void> {
  if (amount > 0) await admin.rpc('add_player_gold', { p_player: userId, p_amount: amount });
}
async function creditAccountXp(admin: Admin, userId: string, amount: number): Promise<void> {
  if (amount > 0) await admin.rpc('add_account_xp', { p_player: userId, p_amount: amount });
}
async function creditResource(admin: Admin, userId: string, key: string, amount: number, arc: number): Promise<void> {
  if (amount > 0) {
    await admin.rpc('add_player_resource', {
      p_player: userId,
      p_resource: key,
      p_amount: amount,
      p_tier: resourceTier(key, arc),
    });
  }
}

/** Forge un équipement au choix (arme/armure) et l'insère, à l'échelle de l'arc. */
async function forgeEquipment(admin: Admin, userId: string, arc: number, tm: number, baseId: string, zone: number): Promise<void> {
  const base = getBase(baseId);
  const mat = forgeMaterialsForArc(arc).find((m) => m.zone === zone);
  if (!base || !mat) throw new Error('Modèle ou zone introuvable');
  const boss = zoneBossMaterialForArc(zone, arc);
  const it = craftItemAtRarity(base, mat, boss, DAILY_RARITY);
  const wp = weaponPassiveFor(base, mat);
  await admin.from('items').insert({
    owner_id: userId,
    item_type: it.item_type,
    name: it.name,
    rarity: it.rarity,
    weight: it.weight,
    tier: arc,
    atk_bonus: Math.round(it.atk_bonus * tm),
    def_bonus: Math.round(it.def_bonus * tm),
    hp_bonus: Math.round(it.hp_bonus * tm),
    base_atk_bonus: Math.round(it.atk_bonus * tm),
    base_def_bonus: Math.round(it.def_bonus * tm),
    base_hp_bonus: Math.round(it.hp_bonus * tm),
    ...(wp ? { passive_type: wp.type, passive_value: wp.pct, base_passive_value: wp.pct } : {}),
  });
}

/** Forge une relique au choix et l'insère (essence de boss de zone pour les secondaires). */
async function forgeRelic(admin: Admin, userId: string, arc: number, tm: number, relicBaseId: string, zone: number): Promise<void> {
  const base = getRelicBase(relicBaseId);
  const mat = forgeMaterialsForArc(arc).find((m) => m.zone === zone);
  if (!base || !mat) throw new Error('Relique ou zone introuvable');
  const boss = zoneBossMaterialForArc(zone, arc);
  const it = craftRelicAtRarity(base, mat, boss, DAILY_RARITY);
  await admin.from('items').insert({
    owner_id: userId,
    item_type: 'relic',
    name: it.name,
    rarity: it.rarity,
    weight: null,
    tier: arc,
    atk_bonus: Math.round(it.atk_bonus * tm),
    def_bonus: Math.round(it.def_bonus * tm),
    hp_bonus: Math.round(it.hp_bonus * tm),
    base_atk_bonus: Math.round(it.atk_bonus * tm),
    base_def_bonus: Math.round(it.def_bonus * tm),
    base_hp_bonus: Math.round(it.hp_bonus * tm),
  });
}

/** Don direct d'un héros grade S garanti de la classe choisie (roll max = q 1 = S). */
async function grantHeroS(admin: Admin, userId: string, classId: string): Promise<void> {
  const { data: cls } = await admin
    .from('hero_classes')
    .select('id, base_hp, base_atk, base_def, base_speed')
    .eq('id', classId)
    .maybeSingle();
  if (!cls) throw new Error('Classe inconnue');
  // bonus = base × ROLL_MAX sur chaque stat → chaque roll normalisé = 1 → q = 1 → S.
  const bonuses = {
    bonus_hp: Math.round((cls.base_hp as number) * ROLL_MAX),
    bonus_atk: Math.round((cls.base_atk as number) * ROLL_MAX),
    bonus_def: Math.round((cls.base_def as number) * ROLL_MAX),
    bonus_speed: Math.round((cls.base_speed as number) * ROLL_MAX),
  };
  const name = rollRecruitName(createRng(hashSeed(userId, 'newbie-s', classId)));
  await admin.from('heroes').insert({ owner_id: userId, class_id: classId, name, ...bonuses });
}

/** Valide le choix pour une récompense (null = OK). */
function validateChoice(reward: NewbieReward, choice: Choice): string | null {
  const kind = rewardChoice(reward);
  if (!kind) return null;
  if (!choice || typeof choice !== 'object') return 'Choix requis';
  if (kind === 'equipment') {
    const base = typeof choice.base_id === 'string' ? getBase(choice.base_id) : undefined;
    if (!base) return 'Modèle inconnu';
    if (reward.type === 'equipment_choice' && !reward.slots.includes(base.itemType)) {
      return 'Ce modèle ne correspond pas à la récompense';
    }
  } else if (kind === 'relic') {
    if (typeof choice.relic_base_id !== 'string' || !getRelicBase(choice.relic_base_id)) return 'Relique inconnue';
  } else if (kind === 'hero') {
    if (typeof choice.class_id !== 'string') return 'Classe requise';
  }
  return null;
}

/** Applique une récompense (après validation + claim atomique). */
async function applyReward(
  admin: Admin,
  userId: string,
  arc: number,
  tm: number,
  furthest: number,
  reward: NewbieReward,
  choice: Choice,
  expKeys: string[],
): Promise<void> {
  switch (reward.type) {
    case 'gold':
      return creditGold(admin, userId, reward.amount);
    case 'account_xp':
      return creditAccountXp(admin, userId, reward.amount);
    case 'expedition_resources': {
      const keys = expKeys.length ? expKeys : Object.values(NEWBIE_EXPEDITION_SIGNATURE_RESOURCE);
      const per = Math.max(1, Math.floor(reward.qty / keys.length));
      for (const key of keys) await creditResource(admin, userId, key, per, arc);
      return;
    }
    case 'equipment_choice':
      return forgeEquipment(admin, userId, arc, tm, choice.base_id, resolveRewardZone(reward, furthest)!);
    case 'relic_choice':
      return forgeRelic(admin, userId, arc, tm, choice.relic_base_id, resolveRewardZone(reward, furthest)!);
    case 'hero_s_choice':
      return grantHeroS(admin, userId, choice.class_id);
  }
}

/* ------------------------------------------------------------ handler ----- */

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: 'Config serveur manquante' }, 500);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Non authentifié' }, 401);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: 'Session invalide' }, 401);

  let body: { action?: unknown; objective_id?: unknown; pct?: unknown; choice?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Corps de requête invalide' }, 400);
  }

  const admin: Admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const EV_COLS = 'starts_at, ends_at, pantin_baseline, claimed_objectives, claimed_milestones';
  const loadEvent = async (): Promise<EventRow | null> => {
    const { data } = await admin.from('newbie_event').select(EV_COLS).eq('player_id', user.id).maybeSingle();
    return (data as EventRow | null) ?? null;
  };

  /* ----------------------------------------------------------------- STATE */
  if (body.action === 'state') {
    let ev = await loadEvent();
    if (!ev) {
      const arc = await playerArcOf(admin, user.id);
      if (arc.max > 1) return json({ eligible: false, event: null });
      const { data: pantin } = await admin.from('pantin_runs').select('days_done').eq('player_id', user.id).maybeSingle();
      const now = new Date();
      const ends = new Date(now.getTime() + NEWBIE_EVENT_DURATION_DAYS * DAY_MS);
      await admin.from('newbie_event').upsert(
        {
          player_id: user.id,
          starts_at: now.toISOString(),
          ends_at: ends.toISOString(),
          pantin_baseline: (pantin?.days_done as number | undefined) ?? 0,
        },
        { onConflict: 'player_id', ignoreDuplicates: true },
      );
      ev = await loadEvent();
    }
    if (!ev) return json({ eligible: false, event: null });

    const signals = await gatherSignals(admin, user.id, ev);
    const objectives = evaluateObjectives(signals);
    const pct = overallPct(objectives);
    const nowMs = Date.now();
    const furthest = await furthestZoneOf(admin, user.id, 1);

    return json({
      eligible: true,
      event: { starts_at: ev.starts_at, ends_at: ev.ends_at },
      active: eventActive(Date.parse(ev.starts_at), Date.parse(ev.ends_at), nowMs),
      server_now: new Date(nowMs).toISOString(),
      furthest_zone: furthest,
      objectives,
      pct,
      milestones_reached: milestonesReached(pct),
      claimed_objectives: ev.claimed_objectives ?? [],
      claimed_milestones: ev.claimed_milestones ?? [],
    });
  }

  /* -------------------------------------------------------- CLAIM OBJECTIF */
  if (body.action === 'claim_objective') {
    const def = typeof body.objective_id === 'string' ? objectiveById(body.objective_id) : undefined;
    if (!def) return json({ error: 'Objectif inconnu' }, 404);
    const ev = await loadEvent();
    if (!ev) return json({ error: 'Aucun événement en cours' }, 400);
    if (!eventActive(Date.parse(ev.starts_at), Date.parse(ev.ends_at), Date.now())) {
      return json({ error: 'Événement terminé' }, 409);
    }
    if ((ev.claimed_objectives ?? []).includes(def.id)) return json({ error: 'Déjà réclamé', already: true }, 409);

    const signals = await gatherSignals(admin, user.id, ev);
    if (!objectiveProgress(def, signals).done) return json({ error: 'Objectif non atteint' }, 400);

    // Validation des choix AVANT le claim atomique (ne pas brûler la réclamation
    // sur un choix invalide).
    for (const r of def.rewards) {
      const err = validateChoice(r, body.choice);
      if (err) return json({ error: err }, 400);
    }

    // Claim atomique : append seulement si l'id n'y est pas déjà.
    const { data: claimed } = await admin
      .from('newbie_event')
      .update({ claimed_objectives: [...(ev.claimed_objectives ?? []), def.id] })
      .eq('player_id', user.id)
      .not('claimed_objectives', 'cs', `{${def.id}}`)
      .select('player_id');
    if (!claimed || claimed.length === 0) return json({ error: 'Déjà réclamé', already: true }, 409);

    const arc = 1;
    const tm = tierGearMult(arc);
    const furthest = await furthestZoneOf(admin, user.id, arc);
    const expKeys = def.expeditionTypeId ? [NEWBIE_EXPEDITION_SIGNATURE_RESOURCE[def.expeditionTypeId]!] : [];
    for (const r of def.rewards) await applyReward(admin, user.id, arc, tm, furthest, r, body.choice, expKeys);

    return json({ ok: true, objective_id: def.id });
  }

  /* -------------------------------------------------------- CLAIM PALIER */
  if (body.action === 'claim_milestone') {
    const pct = typeof body.pct === 'number' ? body.pct : NaN;
    const milestone = milestoneByPct(pct);
    if (!milestone) return json({ error: 'Palier inconnu' }, 404);
    const ev = await loadEvent();
    if (!ev) return json({ error: 'Aucun événement en cours' }, 400);
    if (!eventActive(Date.parse(ev.starts_at), Date.parse(ev.ends_at), Date.now())) {
      return json({ error: 'Événement terminé' }, 409);
    }
    if ((ev.claimed_milestones ?? []).includes(milestone.pct)) return json({ error: 'Déjà réclamé', already: true }, 409);

    const signals = await gatherSignals(admin, user.id, ev);
    if (overallPct(evaluateObjectives(signals)) < milestone.pct) return json({ error: 'Palier non atteint' }, 400);

    for (const r of milestone.rewards) {
      const err = validateChoice(r, body.choice);
      if (err) return json({ error: err }, 400);
    }

    const { data: claimed } = await admin
      .from('newbie_event')
      .update({ claimed_milestones: [...(ev.claimed_milestones ?? []), milestone.pct] })
      .eq('player_id', user.id)
      .not('claimed_milestones', 'cs', `{${milestone.pct}}`)
      .select('player_id');
    if (!claimed || claimed.length === 0) return json({ error: 'Déjà réclamé', already: true }, 409);

    const arc = 1;
    const tm = tierGearMult(arc);
    const furthest = await furthestZoneOf(admin, user.id, arc);
    // Palier d'expédition (50 %) : réparti sur les 3 matériaux signature.
    const expKeys = Object.values(NEWBIE_EXPEDITION_SIGNATURE_RESOURCE);
    for (const r of milestone.rewards) await applyReward(admin, user.id, arc, tm, furthest, r, body.choice, expKeys);

    return json({ ok: true, pct: milestone.pct });
  }

  return json({ error: 'Action inconnue' }, 400);
});
