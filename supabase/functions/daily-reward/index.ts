// Edge Function : daily-reward
// Récompense journalière. Action : claim.
// - Date du jour calculée côté SERVEUR (Europe/Paris) → anti-triche d'horloge.
// - 1 réclamation / jour ; cycle de 10 jours ; jour manqué = série remise à 1.
// - Récompenses = ÉQUIPEMENT ULTIME (jamais d'or, jamais de matériaux) : chaque
//   jour offre un lot complet, toutes les armes OU toutes les armures d'une zone
//   (cf. DAILY_REWARDS). Les objets sont forgés ici, gratuitement.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  DAILY_RARITY,
  dailyStatus,
  rewardForDay,
  type DailyClaimState,
} from '@shared/progression/daily.ts';
import {
  FORGE_BASES,
  craftItemAtRarity,
  getMaterialTier,
  weaponPassiveFor,
  zoneBossMaterial,
} from '@shared/progression/forge.ts';

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

/** Date du jour 'YYYY-MM-DD' au fuseau Europe/Paris (indépendant de l'horloge client). */
function parisToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
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

  // RÉCLAMATION ATOMIQUE (anti multi-onglets) : le check canClaim ci-dessus est
  // sujet à une race (2 onglets lisent « pas encore réclamé » puis créditent
  // tous les deux). On s'approprie donc la journée par un compare-and-swap : on
  // s'assure d'abord qu'une ligne existe (sentinelle, sans toucher l'existante),
  // puis on avance last_claim_date → today UNIQUEMENT si sa valeur est < today.
  // Postgres sérialise la ligne : un seul UPDATE passe, l'autre matche 0 ligne.
  await admin.from('daily_claims').upsert(
    { player_id: user.id, last_claim_date: '1970-01-01', day_index: 0 },
    { onConflict: 'player_id', ignoreDuplicates: true },
  );
  const { data: claimed } = await admin
    .from('daily_claims')
    .update({ last_claim_date: today, day_index: status.day, updated_at: new Date().toISOString() })
    .eq('player_id', user.id)
    .lt('last_claim_date', today)
    .select('player_id');
  if (!claimed || claimed.length === 0) {
    return json({ error: 'Récompense déjà réclamée aujourd’hui', already_claimed: true }, 409);
  }

  // Crédit au tier de l'arc courant du joueur (chaque arc = une pile distincte).
  const tier = await currentArcOf(admin, user.id);

  // Lot du jour : TOUS les modèles du type demandé (8 armes ou 3 armures), en
  // ultime, forgés avec le composant de zone du jour.
  // deno-lint-ignore no-explicit-any
  const grantedItems: any[] = [];
  const mat = getMaterialTier(reward.materialId);
  if (mat) {
    // Objet OFFERT : le joueur n'a choisi aucune essence, donc on lui prête
    // celle du boss de la zone d'où vient le composant — sinon le cadeau
    // sortirait sans aucune stat secondaire (zones 1-3 : il n'y a pas de boss,
    // donc pas d'essence, et c'est normal).
    const boss = zoneBossMaterial(mat.zone);
    const bases = FORGE_BASES.filter((b) => b.itemType === reward.kind);
    for (const base of bases) {
      const it = craftItemAtRarity(base, mat, boss, DAILY_RARITY);
      // Passif du modèle (Arc → critique, Dague → esquive) : sans ça, l'Arc et
      // la Dague offerts seraient des versions amputées de ceux de la forge.
      const wp = weaponPassiveFor(base, mat);
      const { data } = await admin
        .from('items')
        .insert({
          owner_id: user.id,
          item_type: it.item_type,
          name: it.name,
          rarity: it.rarity,
          weight: it.weight,
          tier,
          atk_bonus: it.atk_bonus,
          def_bonus: it.def_bonus,
          hp_bonus: it.hp_bonus,
          base_atk_bonus: it.atk_bonus,
          base_def_bonus: it.def_bonus,
          base_hp_bonus: it.hp_bonus,
          ...(wp ? { passive_type: wp.type, passive_value: wp.pct, base_passive_value: wp.pct } : {}),
        })
        .select()
        .single();
      if (data) grantedItems.push(data);
    }
  }

  // (La réclamation a déjà été persistée atomiquement par le compare-and-swap
  // ci-dessus — plus d'upsert final, qui rouvrirait la fenêtre de double crédit.)

  return json({
    ok: true,
    day: status.day,
    kind: reward.kind,
    items: grantedItems,
  });
});
