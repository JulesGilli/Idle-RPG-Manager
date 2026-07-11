// Edge Function : daily-reward
// Récompense journalière. Action : claim.
// - Date du jour calculée côté SERVEUR (Europe/Paris) → anti-triche d'horloge.
// - 1 réclamation / jour ; cycle de 10 jours ; jour manqué = série remise à 1.
// - Récompenses = MATÉRIAUX (jamais d'or) ; jour 10 = objet ULTIME de zone 10.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { dailyStatus, rewardForDay, type DailyClaimState } from '@shared/progression/daily.ts';
import { getMaterialTier } from '@shared/progression/forge.ts';
import { RELIC_BASES, craftRelicAtRarity } from '@shared/progression/relic.ts';
import { SETS, SET_PIECES, craftSetPieceStats } from '@shared/progression/sets.ts';

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

async function addResources(
  admin: Admin,
  userId: string,
  resources: { key: string; qty: number }[],
  tier = 1,
): Promise<void> {
  for (const { key, qty } of resources) {
    if (qty <= 0) continue;
    const { data: row } = await admin
      .from('player_resources')
      .select('amount')
      .eq('player_id', userId)
      .eq('resource', key)
      .eq('tier', tier)
      .maybeSingle();
    await admin
      .from('player_resources')
      .upsert(
        { player_id: userId, resource: key, amount: (row?.amount ?? 0) + qty, tier },
        { onConflict: 'player_id,resource,tier' },
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

  // Crédit des ressources (matériaux de zone ET gemmes).
  await addResources(admin, user.id, reward.materials, tier);

  // Objets offerts en ultime : reliques (1 par type) et/ou set complet aléatoire.
  // deno-lint-ignore no-explicit-any
  const grantedItems: any[] = [];

  // deno-lint-ignore no-explicit-any
  async function insertItem(row: Record<string, any>): Promise<void> {
    const { data } = await admin.from('items').insert(row).select().single();
    if (data) grantedItems.push(data);
  }

  // Reliques (J3/6/9) : une par modèle (RELIC_BASES), en ultime, forgées avec le composant de zone.
  if (reward.relics) {
    const mat = getMaterialTier(reward.relics.materialId);
    if (mat) {
      for (const base of RELIC_BASES) {
        const r = craftRelicAtRarity(base, mat, 'ultimate');
        await insertItem({
          owner_id: user.id,
          item_type: 'relic',
          name: r.name,
          rarity: r.rarity,
          weight: null,
          tier,
          atk_bonus: r.atk_bonus,
          def_bonus: r.def_bonus,
          hp_bonus: r.hp_bonus,
          base_atk_bonus: r.atk_bonus,
          base_def_bonus: r.def_bonus,
          base_hp_bonus: r.hp_bonus,
        });
      }
    }
  }

  // Set complet (J10) : un set ALÉATOIRE, toutes ses pièces en ultime, composant de zone donné.
  if (reward.set) {
    const mat = getMaterialTier(reward.set.materialId);
    const set = SETS[Math.floor(Math.random() * SETS.length)];
    if (mat && set) {
      const pieces = SET_PIECES.filter((p) => p.setId === set.id);
      for (const piece of pieces) {
        const stats = craftSetPieceStats(piece, mat);
        await insertItem({
          owner_id: user.id,
          item_type: piece.slot,
          name: `${piece.label} (${set.name})`,
          rarity: 'ultimate',
          weight: piece.weight,
          tier,
          set_id: piece.setId,
          atk_bonus: stats.atk,
          def_bonus: stats.def,
          hp_bonus: stats.hp,
          base_atk_bonus: stats.atk,
          base_def_bonus: stats.def,
          base_hp_bonus: stats.hp,
        });
      }
    }
  }

  // (La réclamation a déjà été persistée atomiquement par le compare-and-swap
  // ci-dessus — plus d'upsert final, qui rouvrirait la fenêtre de double crédit.)

  return json({
    ok: true,
    day: status.day,
    materials: reward.materials,
    items: grantedItems,
  });
});
