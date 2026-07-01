// Edge Function : forge
// Actions : craft (fabriquer une arme/armure) et upgrade (amélioration).
// Coûts (or + matériaux) et jets de réussite calculés CÔTÉ SERVEUR (anti-triche).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createRng } from '@shared/combat/prng.ts';
import {
  craftItem,
  CRAFT_RECIPES,
  CRAFT_RARITIES,
  upgradeCost,
  upgradeSuccessChance,
  effectiveBonus,
  UPGRADE_MAX,
  type CraftRarity,
  type Recipe,
} from '@shared/progression/forge.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Body = { action?: unknown; item_type?: unknown; rarity?: unknown; item_id?: unknown };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// deno-lint-ignore no-explicit-any
type Admin = any;

/** Vérifie or + matériaux, retourne l'erreur ou null si OK. */
async function checkCost(
  admin: Admin,
  userId: string,
  recipe: Recipe,
): Promise<{ gold: number; res: Record<string, number> } | { error: string }> {
  const { data: profile } = await admin
    .from('profiles')
    .select('gold')
    .eq('id', userId)
    .single();
  const gold = profile?.gold ?? 0;
  if (gold < recipe.gold) return { error: 'Or insuffisant' };

  const keys = recipe.materials.map((m) => m.key);
  const { data: rows } = await admin
    .from('player_resources')
    .select('resource, amount')
    .eq('player_id', userId)
    .in('resource', keys);
  const res: Record<string, number> = {};
  for (const r of rows ?? []) res[r.resource] = r.amount;
  for (const m of recipe.materials) {
    if ((res[m.key] ?? 0) < m.qty) return { error: `Matériau insuffisant : ${m.key}` };
  }
  return { gold, res };
}

async function consumeCost(
  admin: Admin,
  userId: string,
  recipe: Recipe,
  gold: number,
  res: Record<string, number>,
): Promise<void> {
  await admin
    .from('profiles')
    .update({ gold: gold - recipe.gold })
    .eq('id', userId);
  for (const m of recipe.materials) {
    await admin
      .from('player_resources')
      .update({ amount: (res[m.key] ?? 0) - m.qty })
      .eq('player_id', userId)
      .eq('resource', m.key);
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

  const admin: Admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // ---------------------------------------------------------------- CRAFT
  if (body.action === 'craft') {
    const itemType = body.item_type;
    const rarity = body.rarity;
    if (itemType !== 'weapon' && itemType !== 'armor') {
      return json({ error: 'Type craftable : arme ou armure' }, 400);
    }
    if (typeof rarity !== 'string' || !CRAFT_RARITIES.includes(rarity as CraftRarity)) {
      return json({ error: 'Rareté invalide' }, 400);
    }
    const recipe = CRAFT_RECIPES[rarity as CraftRarity];
    const check = await checkCost(admin, user.id, recipe);
    if ('error' in check) return json({ error: check.error }, 400);

    await consumeCost(admin, user.id, recipe, check.gold, check.res);

    const rng = createRng(Math.floor(Math.random() * 2_147_483_647));
    const crafted = craftItem(itemType, rarity as CraftRarity, 1, rng);
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
    return json({ item });
  }

  // -------------------------------------------------------------- UPGRADE
  if (body.action === 'upgrade') {
    if (typeof body.item_id !== 'string') return json({ error: 'item_id invalide' }, 400);

    const { data: item } = await admin
      .from('items')
      .select('id, upgrade_level, base_atk_bonus, base_def_bonus, base_hp_bonus')
      .eq('id', body.item_id)
      .eq('owner_id', user.id)
      .single();
    if (!item) return json({ error: 'Objet introuvable' }, 404);
    if (item.upgrade_level >= UPGRADE_MAX) return json({ error: 'Niveau maximum atteint' }, 400);

    const recipe = upgradeCost(item.upgrade_level);
    const check = await checkCost(admin, user.id, recipe);
    if ('error' in check) return json({ error: check.error }, 400);

    await consumeCost(admin, user.id, recipe, check.gold, check.res);

    const rng = createRng(Math.floor(Math.random() * 2_147_483_647));
    const success = rng.next() < upgradeSuccessChance(item.upgrade_level);
    const newLevel = success
      ? item.upgrade_level + 1
      : Math.max(0, item.upgrade_level - 1);

    await admin
      .from('items')
      .update({
        upgrade_level: newLevel,
        atk_bonus: effectiveBonus(item.base_atk_bonus, newLevel),
        def_bonus: effectiveBonus(item.base_def_bonus, newLevel),
        hp_bonus: effectiveBonus(item.base_hp_bonus, newLevel),
      })
      .eq('id', item.id);

    return json({ success, upgrade_level: newLevel });
  }

  return json({ error: 'Action inconnue' }, 400);
});
