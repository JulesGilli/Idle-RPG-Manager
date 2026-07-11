// Edge Function : arc
// Lecture / changement d'ARC (New Game+) pour le joueur courant. Les arcs sont des
// pistes PARALLÈLES switchables : on ne peut basculer que sur un arc DÉJÀ débloqué
// (arc <= max_arc). Le déblocage d'un arc supérieur se fait ailleurs (boss d'arc /
// admin) — cette fonction ne fait que lire et poser current_arc.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Body = {
  action?: unknown;
  arc?: unknown;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// deno-lint-ignore no-explicit-any
type Admin = any;

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
    return json({ error: 'Corps invalide' }, 400);
  }

  const admin: Admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Ligne player_arc du joueur (défaut {1,1} si absente).
  const { data: row } = await admin
    .from('player_arc')
    .select('current_arc, max_arc')
    .eq('player_id', user.id)
    .maybeSingle();
  const currentArc = Math.max(1, (row?.current_arc as number | undefined) ?? 1);
  const maxArc = Math.max(1, (row?.max_arc as number | undefined) ?? 1);

  // ---------------------------------------------------------------- GET
  if (body.action === 'get') {
    return json({ current_arc: currentArc, max_arc: maxArc });
  }

  // ---------------------------------------------------------------- SET
  if (body.action === 'set') {
    const arc = body.arc;
    if (typeof arc !== 'number' || !Number.isInteger(arc) || arc < 1) {
      return json({ error: 'arc invalide' }, 400);
    }
    if (arc > maxArc) {
      return json({ error: `Arc ${arc} non débloqué (max ${maxArc})` }, 403);
    }
    await admin
      .from('player_arc')
      .upsert(
        { player_id: user.id, current_arc: arc, max_arc: maxArc },
        { onConflict: 'player_id' },
      );
    return json({ current_arc: arc, max_arc: maxArc });
  }

  return json({ error: 'Action inconnue' }, 400);
});
