// Edge Function : newbie-event
// Event du NOUVEAU JOUEUR (Arc 1). Tranche 1 : action `state` uniquement —
// ouvre l'event au 1er appel pour un compte encore en Arc 1, puis calcule la
// progression des objectifs DANS la fenêtre de 7 jours.
//
// Tout est lu en service_role (les tables de progression sont RLS select-own).
// Le comptage « pendant la fenêtre » se fait ici via les horodatages
// (cleared_at / created_at / claimed_at) et le baseline pantin ; le module pur
// `newbieEvent.ts` ne fait que juger des signaux déjà fenêtrés.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  NEWBIE_EVENT_DURATION_DAYS,
  evaluateObjectives,
  overallPct,
  milestonesReached,
  eventActive,
  type NewbieSignals,
} from '@shared/progression/newbieEvent.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// deno-lint-ignore no-explicit-any
type Admin = any;

const DAY_MS = 86_400_000;

/** Arc courant + max_arc du joueur (défaut 1). */
async function playerArcOf(admin: Admin, userId: string): Promise<{ current: number; max: number }> {
  const { data } = await admin
    .from('player_arc')
    .select('current_arc, max_arc')
    .eq('player_id', userId)
    .maybeSingle();
  return {
    current: Math.max(1, (data?.current_arc as number | undefined) ?? 1),
    max: Math.max(1, (data?.max_arc as number | undefined) ?? 1),
  };
}

/** N° de zones (maps.sort) dont le boss est tombé depuis `startsAt`, Arc 1. */
async function bossZonesCleared(admin: Admin, userId: string, startsAt: string): Promise<number[]> {
  const { data: cleared } = await admin
    .from('level_progress')
    .select('level_id')
    .eq('player_id', userId)
    .eq('arc', 1)
    .gte('cleared_at', startsAt);
  const ids = (cleared ?? []).map((r: { level_id: string }) => r.level_id);
  if (ids.length === 0) return [];

  const { data: bossLevels } = await admin
    .from('levels')
    .select('map_id')
    .in('id', ids)
    .eq('is_boss', true);
  const mapIds = [...new Set((bossLevels ?? []).map((l: { map_id: string }) => l.map_id as string))];
  if (mapIds.length === 0) return [];

  const { data: maps } = await admin.from('maps').select('sort').in('id', mapIds);
  return [...new Set((maps ?? []).map((m: { sort: number }) => m.sort))];
}

/** Tiers de donjon réussis depuis `startsAt`, Arc 1. */
async function dungeonTiersCleared(admin: Admin, userId: string, startsAt: string): Promise<number[]> {
  const { data: runs } = await admin
    .from('dungeon_runs')
    .select('dungeon_type_id')
    .eq('player_id', userId)
    .eq('arc', 1)
    .eq('success', true)
    .gte('created_at', startsAt);
  const typeIds = [...new Set((runs ?? []).map((r: { dungeon_type_id: string }) => r.dungeon_type_id as string))];
  if (typeIds.length === 0) return [];

  const { data: types } = await admin.from('dungeon_types').select('tier').in('id', typeIds);
  return [...new Set((types ?? []).map((t: { tier: number }) => t.tier))];
}

/** Types d'expédition réclamés depuis `startsAt`. */
async function expeditionTypesClaimed(admin: Admin, userId: string, startsAt: string): Promise<string[]> {
  const { data } = await admin
    .from('expedition_runs')
    .select('expedition_type_id')
    .eq('player_id', userId)
    .eq('status', 'claimed')
    .gte('claimed_at', startsAt);
  return [...new Set((data ?? []).map((r: { expedition_type_id: string }) => r.expedition_type_id as string))];
}

/** Meilleur étage courant par poids de tour (Arc 1). */
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

  let body: { action?: unknown };
  try {
    body = (await req.json()) as { action?: unknown };
  } catch {
    return json({ error: 'Corps de requête invalide' }, 400);
  }

  const admin: Admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  if (body.action === 'state') {
    // Ligne d'event existante ?
    const { data: existing } = await admin
      .from('newbie_event')
      .select('starts_at, ends_at, pantin_baseline')
      .eq('player_id', user.id)
      .maybeSingle();

    let ev = existing as { starts_at: string; ends_at: string; pantin_baseline: number } | null;

    // Pas d'event : on l'ouvre UNIQUEMENT pour un compte encore en Arc 1
    // (max_arc === 1). Un vétéran (arc 1 déjà bouclé) n'a jamais d'event.
    if (!ev) {
      const arc = await playerArcOf(admin, user.id);
      if (arc.max > 1) {
        return json({ eligible: false, event: null });
      }
      const { data: pantin } = await admin
        .from('pantin_runs')
        .select('days_done')
        .eq('player_id', user.id)
        .maybeSingle();
      const baseline = (pantin?.days_done as number | undefined) ?? 0;
      const now = new Date();
      const ends = new Date(now.getTime() + NEWBIE_EVENT_DURATION_DAYS * DAY_MS);
      // `ignoreDuplicates` : deux onglets qui ouvrent l'event en même temps ne
      // créent qu'une ligne ; on relit ensuite la ligne qui a gagné.
      await admin.from('newbie_event').upsert(
        {
          player_id: user.id,
          starts_at: now.toISOString(),
          ends_at: ends.toISOString(),
          pantin_baseline: baseline,
        },
        { onConflict: 'player_id', ignoreDuplicates: true },
      );
      const { data: created } = await admin
        .from('newbie_event')
        .select('starts_at, ends_at, pantin_baseline')
        .eq('player_id', user.id)
        .maybeSingle();
      ev = created as typeof ev;
    }

    if (!ev) return json({ eligible: false, event: null });

    // Signaux bruts, fenêtrés à partir de starts_at.
    const startsAt = ev.starts_at;
    const [zones, tiers, expTypes, floors, pantinRow, guildRow] = await Promise.all([
      bossZonesCleared(admin, user.id, startsAt),
      dungeonTiersCleared(admin, user.id, startsAt),
      expeditionTypesClaimed(admin, user.id, startsAt),
      towerFloors(admin, user.id),
      admin.from('pantin_runs').select('days_done').eq('player_id', user.id).maybeSingle(),
      admin.from('guild_members').select('player_id').eq('player_id', user.id).maybeSingle(),
    ]);

    const pantinDaysNow = (pantinRow.data?.days_done as number | undefined) ?? 0;
    const signals: NewbieSignals = {
      bossZonesCleared: zones,
      dungeonTiersCleared: tiers,
      expeditionTypesClaimed: expTypes,
      pantinDaysInWindow: Math.max(0, pantinDaysNow - ev.pantin_baseline),
      towerFloorsByWeight: floors,
      inGuild: Boolean(guildRow.data),
    };

    const objectives = evaluateObjectives(signals);
    const pct = overallPct(objectives);
    const nowMs = Date.now();

    return json({
      eligible: true,
      event: { starts_at: ev.starts_at, ends_at: ev.ends_at },
      active: eventActive(Date.parse(ev.starts_at), Date.parse(ev.ends_at), nowMs),
      server_now: new Date(nowMs).toISOString(),
      objectives,
      pct,
      milestones_reached: milestonesReached(pct),
    });
  }

  return json({ error: 'Action inconnue' }, 400);
});
