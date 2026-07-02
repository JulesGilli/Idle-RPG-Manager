// Edge Function : skills
// Bibliothèque du Savoir — dépense d'un point de compétence dans l'arbre de la
// classe du héros. Validation config-aware CÔTÉ SERVEUR (anti-triche : la table
// heroes est SELECT-only pour le client, toute mutation passe ici).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { validateLearn, type LearnedSkills } from '@shared/progression/skills.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Body = {
  action?: unknown;
  hero_id?: unknown;
  node_id?: unknown;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
    return json({ error: 'Corps invalide' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // ------------------------------------------------------------------- LEARN
  if (body.action === 'learn') {
    if (typeof body.hero_id !== 'string') return json({ error: 'hero_id invalide' }, 400);
    if (typeof body.node_id !== 'string') return json({ error: 'node_id invalide' }, 400);

    const { data: hero } = await admin
      .from('heroes')
      .select('id, class_id, skill_points, skills')
      .eq('id', body.hero_id)
      .eq('owner_id', user.id)
      .maybeSingle();
    if (!hero) return json({ error: 'Héros non possédé' }, 403);

    if ((hero.skill_points ?? 0) <= 0) return json({ error: 'Aucun point de compétence' }, 400);

    const learned = (hero.skills ?? {}) as LearnedSkills;
    const check = validateLearn(hero.class_id, learned, body.node_id);
    if (!check.ok) return json({ error: check.reason ?? 'Achat impossible' }, 400);

    const nextSkills: LearnedSkills = {
      ...learned,
      [body.node_id]: (learned[body.node_id] ?? 0) + 1,
    };

    await admin
      .from('heroes')
      .update({ skills: nextSkills, skill_points: hero.skill_points - 1 })
      .eq('id', hero.id)
      .eq('owner_id', user.id);

    return json({ ok: true, skills: nextSkills, skill_points: hero.skill_points - 1 });
  }

  return json({ error: 'Action inconnue' }, 400);
});
