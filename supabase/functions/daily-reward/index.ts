// Edge Function : daily-reward
// Récompense journalière. Action : claim.
// - Date du jour calculée côté SERVEUR (Europe/Paris) → anti-triche d'horloge.
// - 1 réclamation / jour ; cycle de 10 jours ; jour manqué = série remise à 1.
// - Récompenses = MATÉRIAUX (jamais d'or) ; jour 10 = objet ULTIME de zone 10.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { dailyStatus, rewardForDay, type DailyClaimState } from '@shared/progression/daily.ts';
import { FORGE_BASES, getMaterialTier, craftItemAtRarity } from '@shared/progression/forge.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Composant de zone 10 pour l'objet ultime du jour 10. */
const ZONE10_MATERIAL = 'etoiles';

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

async function addResources(
  admin: Admin,
  userId: string,
  resources: { key: string; qty: number }[],
): Promise<void> {
  for (const { key, qty } of resources) {
    if (qty <= 0) continue;
    const { data: row } = await admin
      .from('player_resources')
      .select('amount')
      .eq('player_id', userId)
      .eq('resource', key)
      .maybeSingle();
    await admin
      .from('player_resources')
      .upsert(
        { player_id: userId, resource: key, amount: (row?.amount ?? 0) + qty },
        { onConflict: 'player_id,resource' },
      );
  }
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

  const today = parisToday();
  const { data: claim } = await admin
    .from('daily_claims')
    .select('last_claim_date, day_index')
    .eq('player_id', user.id)
    .maybeSingle();

  const state: DailyClaimState = {
    lastClaimDate: (claim?.last_claim_date as string | null) ?? null,
    dayIndex: (claim?.day_index as number | null) ?? 0,
  };
  const status = dailyStatus(state, today);
  if (!status.canClaim) {
    return json({ error: 'Récompense déjà réclamée aujourd’hui', already_claimed: true }, 409);
  }

  const reward = rewardForDay(status.day);

  // Crédit des matériaux.
  await addResources(admin, user.id, reward.materials);

  // Jour 10 : objet ULTIME de zone 10 (arme ou armure au hasard, rareté forcée).
  // deno-lint-ignore no-explicit-any
  let grantedItem: any = null;
  if (reward.item) {
    const mat = getMaterialTier(ZONE10_MATERIAL);
    if (mat) {
      const base = FORGE_BASES[Math.floor(Math.random() * FORGE_BASES.length)]!;
      const crafted = craftItemAtRarity(base, mat, 'ultimate');
      const { data: item } = await admin
        .from('items')
        .insert({
          owner_id: user.id,
          item_type: crafted.item_type,
          name: crafted.name,
          rarity: crafted.rarity,
          weight: crafted.weight,
          tier: crafted.tier,
          atk_bonus: crafted.atk_bonus,
          def_bonus: crafted.def_bonus,
          hp_bonus: crafted.hp_bonus,
          base_atk_bonus: crafted.atk_bonus,
          base_def_bonus: crafted.def_bonus,
          base_hp_bonus: crafted.hp_bonus,
        })
        .select()
        .single();
      grantedItem = item;
    }
  }

  // Persiste la réclamation (upsert : 1 ligne / joueur).
  await admin.from('daily_claims').upsert(
    {
      player_id: user.id,
      last_claim_date: today,
      day_index: status.day,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'player_id' },
  );

  return json({
    ok: true,
    day: status.day,
    materials: reward.materials,
    item: grantedItem,
  });
});
