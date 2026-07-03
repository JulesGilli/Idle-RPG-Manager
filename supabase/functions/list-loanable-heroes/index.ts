// Edge Function : list-loanable-heroes
// Retourne les héros d'AUTRES joueurs actuellement empruntables (non engagés).
// Pas encore de notion d'amis/guilde en DB → scope = tous les joueurs (à
// restreindre plus tard). Lecture via service_role (les héros d'autrui sont
// SELECT-only-own côté client) ; on ne renvoie qu'un résumé public.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { isHeroAvailableForLoan } from '@shared/progression/heroLoan.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_RESULTS = 100;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// deno-lint-ignore no-explicit-any
type Admin = any;

/** Ids des héros engagés chez leur propriétaire (indisponibles au prêt). */
async function engagedHeroIds(admin: Admin): Promise<string[]> {
  const engaged = new Set<string>();
  const { data: deps } = await admin.from('deployments').select('hero_ids');
  for (const r of deps ?? []) for (const h of (r.hero_ids as string[]) ?? []) engaged.add(h);
  // Expéditions (ancien système idle). TODO: ajouter expedition_runs(in_progress)
  // quand le nouveau système d'expéditions sera en place.
  const { data: exps } = await admin.from('expeditions').select('hero_ids');
  for (const r of exps ?? []) for (const h of (r.hero_ids as string[]) ?? []) engaged.add(h);
  // Héros déjà prêtés et dont le prêt est encore actif.
  const { data: loans } = await admin
    .from('hero_loans')
    .select('hero_id')
    .gt('expires_at', new Date().toISOString());
  for (const r of loans ?? []) engaged.add(r.hero_id as string);
  return [...engaged];
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

  const admin: Admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Héros des AUTRES joueurs (jamais les siens) + nom du propriétaire.
  const { data: heroes, error } = await admin
    .from('heroes')
    .select(
      'id, name, class_id, level, owner_id, owner:profiles!heroes_owner_id_fkey(display_name)',
    )
    .neq('owner_id', user.id)
    .limit(500);
  if (error) return json({ error: 'Erreur de lecture des héros' }, 500);

  const engaged = await engagedHeroIds(admin);

  // deno-lint-ignore no-explicit-any
  const loanable = (heroes ?? [])
    .filter((h: any) => isHeroAvailableForLoan(h.id, engaged))
    .slice(0, MAX_RESULTS)
    // deno-lint-ignore no-explicit-any
    .map((h: any) => ({
      id: h.id,
      name: h.name,
      class_id: h.class_id,
      level: h.level,
      owner_id: h.owner_id,
      owner_name: h.owner?.display_name ?? 'Joueur',
    }));

  return json({ heroes: loanable });
});
