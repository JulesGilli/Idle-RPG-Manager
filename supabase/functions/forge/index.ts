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
  materialZoneOfName,
  zoneFarmMaterial,
  forgeLevelInfo,
  forgeMasteryXpGain,
  weaponPassiveFor,
  UPGRADE_MAX,
  type Recipe,
} from '@shared/progression/forge.ts';
import { unlockedMaterialTier } from '@shared/progression/arcs.ts';
import { tierGearMult, arcTuning } from '@shared/progression/arc.ts';
import {
  craftJewel,
  getGem,
  gemByPassive,
  jewelRecipe,
  jewelLevelInfo,
  jewelMasteryXpGain,
  refinedJewelPct,
  refineCost,
  refineSuccessChance,
  REFINE_MAX,
} from '@shared/progression/jewelry.ts';
import {
  craftRelic,
  getRelicBase,
  relicRecipe,
  relicLevelInfo,
  relicMasteryXpGain,
} from '@shared/progression/relic.ts';
import { blessingCost, validateBless } from '@shared/progression/blessing.ts';
import { setPieceById, setPieceRecipe, setById, craftSetPieceStats } from '@shared/progression/sets.ts';
import { isReleasedFor } from '@shared/progression/release.ts';

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

/** Arc courant du joueur (1 par défaut). Pilote le tier de loot + le scaling. */
async function currentArcOf(admin: Admin, userId: string): Promise<number> {
  const { data } = await admin
    .from('player_arc')
    .select('current_arc')
    .eq('player_id', userId)
    .maybeSingle();
  return Math.max(1, (data?.current_arc as number | undefined) ?? 1);
}

/**
 * Applique la friction d'économie de l'arc (forgeCostMult) à une recette. Arc 1 =
 * ×1 → recette IDENTIQUE. Les quantités de matériaux restent ≥ 1.
 */
function scaleRecipe(recipe: Recipe, mult: number): Recipe {
  if (mult === 1) return recipe;
  return {
    gold: Math.round(recipe.gold * mult),
    materials: recipe.materials.map((m) => ({ key: m.key, qty: Math.max(1, Math.round(m.qty * mult)) })),
  };
}

/** Vérifie or + matériaux (au TIER indiqué = arc), retourne l'erreur ou null si OK. */
async function checkCost(
  admin: Admin,
  userId: string,
  recipe: Recipe,
  tier = 1,
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
    .eq('tier', tier)
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
  tier = 1,
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
      .eq('resource', m.key)
      .eq('tier', tier);
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

  // Arc courant : la forge consomme/produit au TIER = arc. Le coût est frictionné
  // par arcTuning(arc).forgeCostMult et les stats brutes scalées par tierGearMult(arc).
  const arc = await currentArcOf(admin, user.id);
  const forgeCostMult = arcTuning(arc).forgeCostMult;

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

    const recipe: Recipe = scaleRecipe({ gold: mat.gold, materials: mat.materials }, forgeCostMult);
    const check = await checkCost(admin, user.id, recipe, arc);
    if ('error' in check) return json({ error: check.error }, 400);

    await consumeCost(admin, user.id, recipe, check.gold, check.res, arc);

    // Niveau de maîtrise de forge → pilote les probas de rareté (bon stuff plus
    // fréquent en montant). Lu AVANT le craft.
    const { data: forgeProf } = await admin
      .from('profiles')
      .select('forge_xp')
      .eq('id', user.id)
      .single();
    const forgeLevel = forgeLevelInfo((forgeProf?.forge_xp as number | undefined) ?? 0).level;

    const rng = createRng(Math.floor(Math.random() * 2_147_483_647));
    const crafted = craftItem(base, mat, rng, tierGearMult(arc), forgeLevel);
    // Stat SECONDAIRE des modèles qui en portent une (Arc → crit, Dague →
    // esquive). Déterministe : la zone du matériau fixe la puissance.
    const wp = weaponPassiveFor(base, mat);
    const { data: item } = await admin
      .from('items')
      .insert({
        owner_id: user.id,
        item_type: crafted.item_type,
        name: crafted.name,
        rarity: crafted.rarity,
        weight: crafted.weight,
        tier: arc,
        atk_bonus: crafted.atk_bonus,
        def_bonus: crafted.def_bonus,
        hp_bonus: crafted.hp_bonus,
        base_atk_bonus: crafted.atk_bonus,
        base_def_bonus: crafted.def_bonus,
        base_hp_bonus: crafted.hp_bonus,
        ...(wp ? { passive_type: wp.type, passive_value: wp.pct, base_passive_value: wp.pct } : {}),
      })
      .select()
      .single();

    // Gain d'XP de forge (chaque craft fait progresser la maîtrise).
    const forgeXpGain = forgeMasteryXpGain(mat);
    await admin
      .from('profiles')
      .update({ forge_xp: ((forgeProf?.forge_xp as number | undefined) ?? 0) + forgeXpGain })
      .eq('id', user.id);

    return json({ item, forge_xp: forgeXpGain });
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

    const recipe: Recipe = scaleRecipe(jewelRecipe(mat, gem), forgeCostMult);
    const check = await checkCost(admin, user.id, recipe, arc);
    if ('error' in check) return json({ error: check.error }, 400);

    await consumeCost(admin, user.id, recipe, check.gold, check.res, arc);

    // Niveau de maîtrise de joaillerie → pilote les probas de rareté (donc la
    // puissance du passif). Lu AVANT le sertissage.
    const { data: jewelProf } = await admin
      .from('profiles')
      .select('jewel_xp')
      .eq('id', user.id)
      .single();
    const jewelLevel = jewelLevelInfo((jewelProf?.jewel_xp as number | undefined) ?? 0).level;

    const rng = createRng(Math.floor(Math.random() * 2_147_483_647));
    const crafted = craftJewel(mat, gem, rng, jewelLevel);
    // Bijou : aucune stat brute (atk/def/hp = 0), uniquement un passif en % — non
    // scalé par le tier (un % de tier N reste un %). Seul le tier de la pile change.
    const { data: item } = await admin
      .from('items')
      .insert({
        owner_id: user.id,
        item_type: 'jewel',
        name: crafted.name,
        rarity: crafted.rarity,
        weight: null,
        tier: arc,
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

    // Gain d'XP de joaillerie (chaque sertissage fait progresser la maîtrise).
    const jewelXpGain = jewelMasteryXpGain(mat);
    await admin
      .from('profiles')
      .update({ jewel_xp: ((jewelProf?.jewel_xp as number | undefined) ?? 0) + jewelXpGain })
      .eq('id', user.id);

    return json({ item, jewel_xp: jewelXpGain });
  }

  // --------------------------------------------------------- CRAFT RELIC
  // Relique : recette HOMOGÈNE — modèle × composant de zone (puissance) +
  // matériaux de donjon (fragments + sceau). Les TROIS stats (la prioritaire du
  // modèle à pleine puissance, les deux autres alimentées par le boss), rareté
  // pilotée par la maîtrise de reliquaire. Aucun passif (apanage des bijoux).
  if (body.action === 'craft_relic') {
    if (typeof body.base_id !== 'string') return json({ error: 'base_id invalide' }, 400);
    if (typeof body.material_id !== 'string') return json({ error: 'material_id invalide' }, 400);
    const base = getRelicBase(body.base_id);
    if (!base) return json({ error: 'Relique inconnue' }, 400);
    const mat = getMaterialTier(body.material_id);
    if (!mat) return json({ error: 'Matériau inconnu' }, 400);

    const tierError = await checkCraftTier(admin, user.id, mat.craftTier);
    if (tierError) return json({ error: tierError }, 403);

    const recipe: Recipe = scaleRecipe(relicRecipe(mat), forgeCostMult);
    const check = await checkCost(admin, user.id, recipe, arc);
    if ('error' in check) return json({ error: check.error }, 400);

    await consumeCost(admin, user.id, recipe, check.gold, check.res, arc);

    // Niveau de maîtrise de reliquaire → pilote les probas de rareté (donc la
    // puissance de la relique). Lu AVANT le craft, comme forge et joaillerie.
    const { data: relicProf } = await admin
      .from('profiles')
      .select('relic_xp')
      .eq('id', user.id)
      .single();
    const relicLevel = relicLevelInfo((relicProf?.relic_xp as number | undefined) ?? 0).level;

    const rng = createRng(Math.floor(Math.random() * 2_147_483_647));
    const crafted = craftRelic(base, mat, rng, relicLevel);
    // Stats brutes scalées au tier de l'arc (arc 1 = ×1 → inchangé).
    const tm = tierGearMult(arc);
    const atk = Math.round(crafted.atk_bonus * tm);
    const def = Math.round(crafted.def_bonus * tm);
    const hp = Math.round(crafted.hp_bonus * tm);
    const { data: item } = await admin
      .from('items')
      .insert({
        owner_id: user.id,
        item_type: 'relic',
        name: crafted.name,
        rarity: crafted.rarity,
        weight: null,
        tier: arc,
        atk_bonus: atk,
        def_bonus: def,
        hp_bonus: hp,
        base_atk_bonus: atk,
        base_def_bonus: def,
        base_hp_bonus: hp,
      })
      .select()
      .single();

    // Gain d'XP de reliquaire (chaque relique fait progresser la maîtrise).
    const relicXpGain = relicMasteryXpGain(mat);
    await admin
      .from('profiles')
      .update({ relic_xp: ((relicProf?.relic_xp as number | undefined) ?? 0) + relicXpGain })
      .eq('id', user.id);

    return json({ item, relic_xp: relicXpGain });
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

    // Verrou de sortie (V1.1) : les nouveaux sets ne sont forgeables qu'à la sortie.
    // Horloge SERVEUR (anti-triche), comme les autres gates de la mise à jour.
    if (set?.gatedUntilRelease) {
      const { data: relCfg } = await admin
        .from('app_config')
        .select('value')
        .eq('key', 'release_at')
        .maybeSingle();
      if (!isReleasedFor((relCfg?.value as string | null) ?? null, Date.now(), user.id)) {
        return json({ error: 'Ce set arrive avec la mise à jour — patiente jusqu’à la sortie.' }, 403);
      }
    }

    const tierError = await checkCraftTier(admin, user.id, mat.craftTier);
    if (tierError) return json({ error: tierError }, 403);

    const recipe: Recipe = scaleRecipe(setPieceRecipe(piece, mat), forgeCostMult);
    const check = await checkCost(admin, user.id, recipe, arc);
    if ('error' in check) return json({ error: check.error }, 400);

    await consumeCost(admin, user.id, recipe, check.gold, check.res, arc);

    // Stats scalées avec le matériau (comme un item de base), puis au tier de l'arc.
    const stats = craftSetPieceStats(piece, mat);
    const tm = tierGearMult(arc);
    const atk = Math.round(stats.atk * tm);
    const def = Math.round(stats.def * tm);
    const hp = Math.round(stats.hp * tm);
    const { data: item } = await admin
      .from('items')
      .insert({
        owner_id: user.id,
        item_type: piece.slot,
        name: `${piece.label} (${set?.name ?? 'Set'})`,
        rarity: 'ultimate',
        weight: piece.weight,
        tier: arc,
        set_id: piece.setId,
        atk_bonus: atk,
        def_bonus: def,
        hp_bonus: hp,
        base_atk_bonus: atk,
        base_def_bonus: def,
        base_hp_bonus: hp,
      })
      .select()
      .single();
    return json({ item });
  }

  // -------------------------------------------------------- REFINE JEWEL
  // Raffinement : améliore le % du passif d'un bijou (plafonné par la gemme).
  // Coûte or + matériau de farm de la zone + 1 gemme du même type. Échec = recul d'un niveau.
  if (body.action === 'refine_jewel') {
    if (typeof body.item_id !== 'string') return json({ error: 'item_id invalide' }, 400);

    const { data: item } = await admin
      .from('items')
      .select('id, name, item_type, upgrade_level, passive_type, passive_value, base_passive_value')
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

    // Coût = matériau de farm de la zone du bijou (déduit du suffixe) + 1 gemme du passif.
    const recipe = scaleRecipe(
      refineCost(
        item.upgrade_level,
        zoneFarmMaterial(materialZoneOfName(item.name) || 1),
        gem.id,
      ),
      forgeCostMult,
    );
    const check = await checkCost(admin, user.id, recipe, arc);
    if ('error' in check) return json({ error: check.error }, 400);

    await consumeCost(admin, user.id, recipe, check.gold, check.res, arc);

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

  // --------------------------------------------------------------- BLESS
  // Bénédiction d'arme (Arc 2) : amplifie l'amplificateur de type de l'arme,
  // plafonnée par son niveau de renforcement. Déterministe (la larme astrale est
  // le vrai coût). Une fois bénie, l'arme ne peut plus être renforcée (cf. UPGRADE).
  if (body.action === 'bless') {
    if (typeof body.item_id !== 'string') return json({ error: 'item_id invalide' }, 400);
    if (arc < 2) return json({ error: 'La bénédiction arrive à l’Arc 2' }, 403);

    const { data: item } = await admin
      .from('items')
      .select('id, name, item_type, upgrade_level, blessing_level')
      .eq('id', body.item_id)
      .eq('owner_id', user.id)
      .single();
    if (!item) return json({ error: 'Objet introuvable' }, 404);

    const blessing = item.blessing_level ?? 0;
    const check = validateBless(item.name, item.item_type, item.upgrade_level, blessing);
    if (!check.ok) return json({ error: check.reason ?? 'Bénédiction impossible' }, 400);

    const recipe: Recipe = scaleRecipe(blessingCost(blessing), forgeCostMult);
    const cost = await checkCost(admin, user.id, recipe, arc);
    if ('error' in cost) return json({ error: cost.error }, 400);

    await consumeCost(admin, user.id, recipe, cost.gold, cost.res, arc);

    const newLevel = blessing + 1;
    await admin.from('items').update({ blessing_level: newLevel }).eq('id', item.id);
    return json({ ok: true, blessing_level: newLevel });
  }

  // -------------------------------------------------------------- UPGRADE
  if (body.action === 'upgrade') {
    if (typeof body.item_id !== 'string') return json({ error: 'item_id invalide' }, 400);

    const { data: item } = await admin
      .from('items')
      .select('id, name, set_id, item_type, upgrade_level, blessing_level, base_atk_bonus, base_def_bonus, base_hp_bonus')
      .eq('id', body.item_id)
      .eq('owner_id', user.id)
      .single();
    if (!item) return json({ error: 'Objet introuvable' }, 404);
    if (item.item_type === 'jewel')
      return json({ error: 'Les bijoux ne sont pas améliorables' }, 400);
    if ((item.blessing_level ?? 0) > 0)
      return json({ error: 'Une arme bénie ne peut plus être renforcée' }, 400);
    if (item.upgrade_level >= UPGRADE_MAX) return json({ error: 'Niveau maximum atteint' }, 400);

    // Matériau consommé = farm de la zone de l'objet (set = zone 10, sinon suffixe).
    const zone = item.set_id ? 10 : materialZoneOfName(item.name);
    const recipe = scaleRecipe(upgradeCost(item.upgrade_level, zoneFarmMaterial(zone || 1)), forgeCostMult);
    const check = await checkCost(admin, user.id, recipe, arc);
    if ('error' in check) return json({ error: check.error }, 400);

    await consumeCost(admin, user.id, recipe, check.gold, check.res, arc);

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
