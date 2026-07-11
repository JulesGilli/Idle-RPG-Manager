// Edge Function : redeem-code
// Le joueur saisit un CODE secret → reçoit une récompense exclusive (or /
// matériaux / objet ultime de zone 10), une seule fois par code. Contrôles &
// crédit CÔTÉ SERVEUR (anti-triche). Codes créés par l'admin (admin-actions).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { normalizeCode, type RedeemReward } from '@shared/progression/redeem.ts';
import { FORGE_BASES, getBase, getMaterialTier, craftItemAtRarity } from '@shared/progression/forge.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Composant de zone 10 par défaut (legacy `item: true`). */
const ZONE10_MATERIAL = 'etoiles';

type Body = { code?: unknown };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// deno-lint-ignore no-explicit-any
type Admin = any;

async function addGold(admin: Admin, userId: string, gold: number): Promise<void> {
  if (!gold || gold <= 0) return;
  const { data } = await admin.from('profiles').select('gold').eq('id', userId).single();
  await admin.from('profiles').update({ gold: (data?.gold ?? 0) + gold }).eq('id', userId);
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
  materials: { key: string; qty: number }[],
  tier: number,
): Promise<void> {
  for (const { key, qty } of materials) {
    if (!key || qty <= 0) continue;
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

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: 'Corps invalide' }, 400);
  }
  if (typeof body.code !== 'string') return json({ error: 'code invalide' }, 400);
  const code = normalizeCode(body.code);
  if (!code) return json({ error: 'Entre un code' }, 400);

  const admin: Admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // --- Code existant / valide ---
  const { data: row } = await admin
    .from('redeem_codes')
    .select('code, reward, max_uses, uses, expires_at, active')
    .eq('code', code)
    .maybeSingle();
  if (!row) return json({ error: 'Code invalide' }, 404);
  if (!row.active) return json({ error: 'Ce code n’est plus actif' }, 403);
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return json({ error: 'Ce code a expiré' }, 403);
  }
  if (row.max_uses != null && row.uses >= row.max_uses) {
    return json({ error: 'Ce code a atteint sa limite d’utilisation' }, 403);
  }

  const reward = (row.reward ?? {}) as RedeemReward;

  // --- Verrou anti-double-réclamation : l'insert (PK code+joueur) tranche la course.
  const { error: claimErr } = await admin
    .from('redeem_claims')
    .insert({ code, player_id: user.id, granted: reward });
  if (claimErr) {
    // Violation de clé primaire => déjà réclamé par ce joueur.
    return json({ error: 'Tu as déjà utilisé ce code', already_claimed: true }, 409);
  }

  // --- Crédit de la récompense (au tier = arc courant du joueur) ---
  const tier = await currentArcOf(admin, user.id);
  await addGold(admin, user.id, reward.gold ?? 0);
  await addResources(admin, user.id, reward.materials ?? [], tier);

  // deno-lint-ignore no-explicit-any
  let grantedItem: any = null;
  if (reward.item) {
    // `true` = legacy zone 10 ultime ; sinon spéc sur mesure (zone + rareté + modèle).
    const spec =
      reward.item === true
        ? { material_id: ZONE10_MATERIAL, rarity: 'ultimate' as const, base_id: undefined }
        : reward.item;
    const mat = getMaterialTier(spec.material_id);
    if (mat) {
      const base =
        (spec.base_id ? getBase(spec.base_id) : undefined) ??
        FORGE_BASES[Math.floor(Math.random() * FORGE_BASES.length)]!;
      const crafted = craftItemAtRarity(base, mat, spec.rarity ?? 'ultimate');
      const { data: item } = await admin
        .from('items')
        .insert({
          owner_id: user.id,
          item_type: crafted.item_type,
          name: crafted.name,
          rarity: crafted.rarity,
          weight: crafted.weight,
          tier,
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

  // --- Incrémente le compteur d'usages (best-effort). ---
  await admin.from('redeem_codes').update({ uses: (row.uses ?? 0) + 1 }).eq('code', code);

  return json({ ok: true, reward, item: grantedItem });
});
