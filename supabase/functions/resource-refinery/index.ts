// Edge Function : resource-refinery
// La Raffinerie (Arc 2) — bâtiment qui consomme de l'or pour monter le taux de
// drop des ressources de la carte. Deux actions :
//   - get     : niveau courant + coût du prochain palier + or du joueur + arc.
//   - upgrade : dépense l'or et incrémente le niveau, de façon ATOMIQUE (RPC
//               `upgrade_resource_refinery`, compare-and-swap sur le niveau).
// Tout est calculé côté serveur (le client ne fixe ni le coût ni le niveau).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  refineryUpgradeCost,
  refineryDropMult,
  refineryBonusPct,
  refineryMaxed,
  REFINERY_MIN_ARC,
  REFINERY_MAX_LEVEL,
} from '@shared/progression/refinery.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// deno-lint-ignore no-explicit-any
type Admin = any;
type Body = { action?: unknown };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Arc courant du joueur (1 par défaut). */
async function currentArcOf(admin: Admin, userId: string): Promise<number> {
  const { data } = await admin
    .from('player_arc')
    .select('current_arc, max_arc')
    .eq('player_id', userId)
    .maybeSingle();
  // `max_arc` = arc le plus haut débloqué : c'est lui qui commande l'accès (un
  // joueur ayant atteint l'Arc 2 garde la Raffinerie même s'il rejoue l'Arc 1).
  return Math.max(1, (data?.max_arc as number | undefined) ?? 1);
}

async function refineryLevelOf(admin: Admin, userId: string): Promise<number> {
  const { data } = await admin
    .from('resource_refinery')
    .select('level')
    .eq('player_id', userId)
    .maybeSingle();
  return Math.max(0, (data?.level as number | undefined) ?? 0);
}

async function goldOf(admin: Admin, userId: string): Promise<number> {
  const { data } = await admin.from('profiles').select('gold').eq('id', userId).maybeSingle();
  return Math.max(0, (data?.gold as number | undefined) ?? 0);
}

/** État complet renvoyé au client (get et après upgrade). */
async function stateOf(admin: Admin, userId: string) {
  const [arc, level, gold] = await Promise.all([
    currentArcOf(admin, userId),
    refineryLevelOf(admin, userId),
    goldOf(admin, userId),
  ]);
  const maxed = refineryMaxed(level);
  const nextCost = maxed ? null : refineryUpgradeCost(level);
  return {
    unlocked: arc >= REFINERY_MIN_ARC,
    min_arc: REFINERY_MIN_ARC,
    level,
    max_level: REFINERY_MAX_LEVEL,
    bonus_pct: refineryBonusPct(level),
    next_bonus_pct: maxed ? null : refineryBonusPct(level + 1),
    drop_mult: refineryDropMult(level),
    next_cost: nextCost,
    maxed,
    gold,
  };
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

  const admin: Admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  if (body.action === 'get') {
    return json(await stateOf(admin, user.id));
  }

  if (body.action === 'upgrade') {
    const arc = await currentArcOf(admin, user.id);
    if (arc < REFINERY_MIN_ARC) {
      return json({ error: `La Raffinerie se débloque en Arc ${REFINERY_MIN_ARC}.` }, 403);
    }
    const level = await refineryLevelOf(admin, user.id);
    if (refineryMaxed(level)) return json({ error: 'Niveau maximum atteint.' }, 400);

    const cost = refineryUpgradeCost(level);
    // Upgrade ATOMIQUE (dépense d'or + incrément, CAS sur le niveau). Le RPC
    // recale tout sous verrou : deux clics simultanés ne peuvent ni dépenser
    // deux fois ni sauter un niveau.
    const { data: newLevel, error } = await admin.rpc('upgrade_resource_refinery', {
      p_player: user.id,
      p_cost: cost,
      p_from_level: level,
    });
    if (error) return json({ error: 'Échec de la mise à niveau' }, 500);
    if (newLevel === -1) return json({ error: 'Réessaie — le niveau vient de changer.' }, 409);
    if (newLevel === -2) return json({ error: 'Or insuffisant.' }, 402);

    return json({ ok: true, spent: cost, ...(await stateOf(admin, user.id)) });
  }

  return json({ error: 'Action inconnue' }, 400);
});
