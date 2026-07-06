// Edge Function : forge
// Actions : craft (arme/armure), craft_jewel (joaillerie) et upgrade.
// Coûts (or + matériaux) et jets de réussite calculés CÔTÉ SERVEUR (anti-triche).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createRng } from '@shared/combat/prng.ts';
import {
  craftItem,
  getBase,
  getMaterialTier,
  upgradeCost,
  upgradeSuccessChance,
  effectiveBonus,
  UPGRADE_MAX,
  type Recipe,
} from '@shared/progression/forge.ts';
import { unlockedMaterialTier } from '@shared/progression/arcs.ts';
import {
  craftJewel,
  getGem,
  gemByPassive,
  jewelRecipe,
  refinedJewelPct,
  refineCost,
  refineSuccessChance,
  REFINE_MAX,
} from '@shared/progression/jewelry.ts';
import { craftRelic, getRelicBase, relicRecipe } from '@shared/progression/relic.ts';
import { setPieceById, setPieceRecipe, setById, craftSetPieceStats } from '@shared/progression/sets.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Body = {
  action?: unknown;
  base_id?: unknown;
  material_id?: unknown;
  gem_id?: unknown;
  item_id?: unknown;
  piece_id?: unknown;
};

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

/**
 * Tier de matériaux débloqué = 1 + nombre de boss d'arc vaincus. Le gate est
 * la victoire sur le boss de l'arc précédent (table player_arc_progress).
 */
async function checkCraftTier(
  admin: Admin,
  userId: string,
  craftTier: number,
): Promise<string | null> {
  if (craftTier <= 1) return null;
  const { data: rows } = await admin
    .from('player_arc_progress')
    .select('gate_boss_id')
    .eq('player_id', userId);
  const cleared = (rows ?? []).map((r: { gate_boss_id: string }) => r.gate_boss_id);
  if (craftTier > unlockedMaterialTier(cleared)) {
    return `Tier ${craftTier} verrouillé — bats d'abord le boss de l'arc précédent`;
  }
  return null;
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
  // Craft d'un objet SPÉCIFIQUE : base (Grande épée, Sceptre…) × composant
  // de zone (chêne, givre…). Rareté tirée avec les % globaux (côté serveur).
  if (body.action === 'craft') {
    if (typeof body.base_id !== 'string') return json({ error: 'base_id invalide' }, 400);
    if (typeof body.material_id !== 'string') return json({ error: 'material_id invalide' }, 400);
    const base = getBase(body.base_id);
    if (!base) return json({ error: 'Objet inconnu' }, 400);
    const mat = getMaterialTier(body.material_id);
    if (!mat) return json({ error: 'Matériau inconnu' }, 400);

    const tierError = await checkCraftTier(admin, user.id, mat.craftTier);
    if (tierError) return json({ error: tierError }, 403);

    const recipe: Recipe = { gold: mat.gold, materials: mat.materials };
    const check = await checkCost(admin, user.id, recipe);
    if ('error' in check) return json({ error: check.error }, 400);

    await consumeCost(admin, user.id, recipe, check.gold, check.res);

    const rng = createRng(Math.floor(Math.random() * 2_147_483_647));
    const crafted = craftItem(base, mat, rng);
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

  // --------------------------------------------------------- CRAFT JEWEL
  // Joaillerie : composant de zone (PUISSANCE du %) + gemme de boss (TYPE de
  // passif). Aucune stat brute — uniquement un passif en %.
  if (body.action === 'craft_jewel') {
    if (typeof body.material_id !== 'string') return json({ error: 'material_id invalide' }, 400);
    if (typeof body.gem_id !== 'string') return json({ error: 'gem_id invalide' }, 400);
    const mat = getMaterialTier(body.material_id);
    if (!mat) return json({ error: 'Matériau inconnu' }, 400);
    const gem = getGem(body.gem_id);
    if (!gem) return json({ error: 'Gemme inconnue' }, 400);

    const tierError = await checkCraftTier(admin, user.id, mat.craftTier);
    if (tierError) return json({ error: tierError }, 403);

    const recipe: Recipe = jewelRecipe(mat, gem);
    const check = await checkCost(admin, user.id, recipe);
    if ('error' in check) return json({ error: check.error }, 400);

    await consumeCost(admin, user.id, recipe, check.gold, check.res);

    const rng = createRng(Math.floor(Math.random() * 2_147_483_647));
    const crafted = craftJewel(mat, gem, rng);
    const { data: item } = await admin
      .from('items')
      .insert({
        owner_id: user.id,
        item_type: 'jewel',
        name: crafted.name,
        rarity: crafted.rarity,
        weight: null,
        tier: crafted.tier,
        atk_bonus: 0,
        def_bonus: 0,
        hp_bonus: 0,
        base_atk_bonus: 0,
        base_def_bonus: 0,
        base_hp_bonus: 0,
        passive_type: crafted.passive_type,
        passive_value: crafted.passive_value,
        base_passive_value: crafted.passive_value,
      })
      .select()
      .single();
    return json({ item });
  }

  // --------------------------------------------------------- CRAFT RELIC
  // Relique : recette HOMOGÈNE — modèle × composant de zone (puissance) +
  // matériaux de donjon (fragments + sceau). Stats brutes (gros PV), rareté à
  // % globaux. Aucun passif (les passifs restent l'apanage des bijoux).
  if (body.action === 'craft_relic') {
    if (typeof body.base_id !== 'string') return json({ error: 'base_id invalide' }, 400);
    if (typeof body.material_id !== 'string') return json({ error: 'material_id invalide' }, 400);
    const base = getRelicBase(body.base_id);
    if (!base) return json({ error: 'Relique inconnue' }, 400);
    const mat = getMaterialTier(body.material_id);
    if (!mat) return json({ error: 'Matériau inconnu' }, 400);

    const tierError = await checkCraftTier(admin, user.id, mat.craftTier);
    if (tierError) return json({ error: tierError }, 403);

    const recipe: Recipe = relicRecipe(mat);
    const check = await checkCost(admin, user.id, recipe);
    if ('error' in check) return json({ error: check.error }, 400);

    await consumeCost(admin, user.id, recipe, check.gold, check.res);

    const rng = createRng(Math.floor(Math.random() * 2_147_483_647));
    const crafted = craftRelic(base, mat, rng);
    const { data: item } = await admin
      .from('items')
      .insert({
        owner_id: user.id,
        item_type: 'relic',
        name: crafted.name,
        rarity: crafted.rarity,
        weight: null,
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

  // ----------------------------------------------------------- CRAFT SET
  // Pièce de set d'ensemble, forgée depuis les matériaux UNIQUES d'expédition.
  // Universelle (aucune contrainte de poids), stats fixes, marquée set_id.
  if (body.action === 'craft_set') {
    if (typeof body.piece_id !== 'string') return json({ error: 'piece_id invalide' }, 400);
    if (typeof body.material_id !== 'string') return json({ error: 'material_id invalide' }, 400);
    const piece = setPieceById(body.piece_id);
    if (!piece) return json({ error: 'Pièce de set inconnue' }, 400);
    const mat = getMaterialTier(body.material_id);
    if (!mat) return json({ error: 'Matériau inconnu' }, 400);
    const set = setById(piece.setId);

    const tierError = await checkCraftTier(admin, user.id, mat.craftTier);
    if (tierError) return json({ error: tierError }, 403);

    const recipe: Recipe = setPieceRecipe(piece, mat);
    const check = await checkCost(admin, user.id, recipe);
    if ('error' in check) return json({ error: check.error }, 400);

    await consumeCost(admin, user.id, recipe, check.gold, check.res);

    // Stats scalées avec le matériau (comme un item de base).
    const stats = craftSetPieceStats(piece, mat);
    const { data: item } = await admin
      .from('items')
      .insert({
        owner_id: user.id,
        item_type: piece.slot,
        name: `${piece.label} (${set?.name ?? 'Set'})`,
        rarity: 'ultimate',
        weight: piece.weight,
        tier: mat.craftTier,
        set_id: piece.setId,
        atk_bonus: stats.atk,
        def_bonus: stats.def,
        hp_bonus: stats.hp,
        base_atk_bonus: stats.atk,
        base_def_bonus: stats.def,
        base_hp_bonus: stats.hp,
      })
      .select()
      .single();
    return json({ item });
  }

  // -------------------------------------------------------- REFINE JEWEL
  // Raffinement : améliore le % du passif d'un bijou (plafonné par la gemme).
  // Coûte de l'or + 1 gemme du même type. Échec = recul d'un niveau.
  if (body.action === 'refine_jewel') {
    if (typeof body.item_id !== 'string') return json({ error: 'item_id invalide' }, 400);

    const { data: item } = await admin
      .from('items')
      .select('id, item_type, upgrade_level, passive_type, passive_value, base_passive_value')
      .eq('id', body.item_id)
      .eq('owner_id', user.id)
      .single();
    if (!item) return json({ error: 'Objet introuvable' }, 404);
    if (item.item_type !== 'jewel' || !item.passive_type) {
      return json({ error: 'Seuls les bijoux se raffinent' }, 400);
    }
    const gem = gemByPassive(item.passive_type);
    if (!gem) return json({ error: 'Gemme inconnue pour ce passif' }, 400);
    if (item.upgrade_level >= REFINE_MAX) return json({ error: 'Raffinement maximum atteint' }, 400);
    const base = item.base_passive_value > 0 ? item.base_passive_value : item.passive_value;
    if (refinedJewelPct(base, item.upgrade_level, gem) >= gem.maxPct) {
      return json({ error: `Plafond du passif atteint (${gem.maxPct}%)` }, 400);
    }

    const recipe = refineCost(item.upgrade_level, gem);
    const check = await checkCost(admin, user.id, recipe);
    if ('error' in check) return json({ error: check.error }, 400);

    await consumeCost(admin, user.id, recipe, check.gold, check.res);

    const rng = createRng(Math.floor(Math.random() * 2_147_483_647));
    const success = rng.next() < refineSuccessChance(item.upgrade_level);
    const newLevel = success ? item.upgrade_level + 1 : Math.max(0, item.upgrade_level - 1);
    const newValue = refinedJewelPct(base, newLevel, gem);

    await admin
      .from('items')
      .update({
        upgrade_level: newLevel,
        passive_value: newValue,
        base_passive_value: base,
      })
      .eq('id', item.id);

    return json({ success, upgrade_level: newLevel, passive_value: newValue });
  }

  // -------------------------------------------------------------- UPGRADE
  if (body.action === 'upgrade') {
    if (typeof body.item_id !== 'string') return json({ error: 'item_id invalide' }, 400);

    const { data: item } = await admin
      .from('items')
      .select('id, item_type, upgrade_level, base_atk_bonus, base_def_bonus, base_hp_bonus')
      .eq('id', body.item_id)
      .eq('owner_id', user.id)
      .single();
    if (!item) return json({ error: 'Objet introuvable' }, 404);
    if (item.item_type === 'jewel')
      return json({ error: 'Les bijoux ne sont pas améliorables' }, 400);
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
