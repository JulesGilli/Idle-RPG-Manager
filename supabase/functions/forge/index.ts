// Edge Function : forge
// Actions : craft (arme/armure), craft_jewel (joaillerie), craft_relic,
// craft_set, auto_craft (la série jusqu'à la rareté visée), refine_jewel,
// bless et upgrade.
// Coûts (or + matériaux) et jets de réussite calculés CÔTÉ SERVEUR (anti-triche).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createRng } from '@shared/combat/prng.ts';
import {
  craftItem,
  craftRecipe,
  getBase,
  getBossMaterial,
  getMaterialTier,
  FORGE_MATERIALS,
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
  type ForgeBase,
  type ForgeMaterialTheme,
  type BossMaterial,
} from '@shared/progression/forge.ts';
import {
  masteryLevelInfo,
  masteryXpGain,
  autoUnlocked,
  AUTO_MAX_ATTEMPTS,
  AUTO_TARGETS,
  AUTO_UNLOCK_LEVEL,
  type AutoTarget,
} from '@shared/progression/mastery.ts';
import { RARITY_ORDER } from '@shared/progression/loot.ts';
import { tierGearMult, arcTuning } from '@shared/progression/arc.ts';
import {
  divineRelicStats,
  divineRelicPassive,
  divineRelicName,
  divineRelicRecipe,
} from '@shared/progression/divine.ts';
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
  type GemDef,
} from '@shared/progression/jewelry.ts';
import {
  craftRelic,
  getRelicBase,
  relicRecipe,
  relicLevelInfo,
  relicMasteryXpGain,
  type RelicBase,
} from '@shared/progression/relic.ts';
import { blessingCost, validateBless } from '@shared/progression/blessing.ts';
import {
  setPieceById,
  setPieceRecipe,
  setById,
  setArc,
  craftSetPieceStats,
  workshopOfItemType,
  setPieceZone,
  SET_PIECES,
} from '@shared/progression/sets.ts';
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
  /** auto_craft : quel atelier mène la série. */
  kind?: unknown;
  /** auto_craft : rareté visée — on s'arrête dessus ou mieux. */
  target?: unknown;
  /** auto_craft : borné par AUTO_MAX_ATTEMPTS côté serveur. */
  max_attempts?: unknown;
  /** Essence de boss (forge) : oriente les stats secondaires. Facultative. */
  boss_material_id?: unknown;
};

/** Rang d'une rareté (médiocre = 0 → ultime = 4). Sert à comparer à la cible. */
const rarityRank = (r: string): number => (RARITY_ORDER as readonly string[]).indexOf(r);

/**
 * Essence de boss demandée par le client. Absente = craft sans secondaire, ce
 * qui est un choix légitime (et le seul possible en zones 1-3). Présente mais
 * inconnue = erreur : on ne forge pas en avalant silencieusement l'intention.
 */
function resolveBossMaterial(raw: unknown): { boss: BossMaterial | null } | { error: string } {
  if (raw === undefined || raw === null || raw === '') return { boss: null };
  if (typeof raw !== 'string') return { error: 'boss_material_id invalide' };
  const boss = getBossMaterial(raw);
  return boss ? { boss } : { error: 'Essence de boss inconnue' };
}

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

type MasteryColumn = 'forge_xp' | 'jewel_xp' | 'relic_xp';

/** XP totale d'une maîtrise (0 si le profil ne la porte pas encore). */
async function masteryXpOf(admin: Admin, userId: string, column: MasteryColumn): Promise<number> {
  const { data } = await admin.from('profiles').select(column).eq('id', userId).single();
  return ((data ?? {}) as Record<string, number | undefined>)[column] ?? 0;
}

/** Colonne de maîtrise de l'atelier responsable d'un type d'objet. */
function masteryColumnOfItemType(itemType: string): MasteryColumn | undefined {
  const workshop = workshopOfItemType(itemType);
  if (!workshop) return undefined;
  return ({ forge: 'forge_xp', jewelry: 'jewel_xp', altar: 'relic_xp' } as const)[workshop];
}

/**
 * Niveau de la maîtrise qui gouverne l'AMÉLIORATION d'un objet : c'est l'atelier
 * responsable du type qui décide (forge → armes/armures, autel → reliques,
 * joaillerie → bijoux). `undefined` si aucun atelier ne le revendique → pas de
 * bonus, la chance de base s'applique.
 */
async function upgradeMasteryLevel(
  admin: Admin,
  userId: string,
  itemType: string,
): Promise<number | undefined> {
  const column = masteryColumnOfItemType(itemType);
  if (!column) return undefined;
  return masteryLevelInfo(await masteryXpOf(admin, userId, column)).level;
}

/**
 * Crédite l'atelier de l'XP d'une TENTATIVE d'amélioration (renforcement ou
 * raffinage), réussie ou non.
 *
 * Seul le CRAFT en donnait, ce qui condamnait deux ateliers sur trois : la forge
 * grimpait vite (auto-craft, des centaines de pièces), tandis que l'autel et la
 * joaillerie — où l'on améliore bien plus qu'on ne crée — restaient collés au
 * niveau 1. En base : forge_xp 8434 contre jewel_xp 92 et relic_xp 0 chez le
 * même joueur. On paie le matériau et on prend le risque de l'échec : la
 * pratique compte, donc l'XP tombe sur la tentative et pas sur la réussite.
 */
async function grantUpgradeMasteryXp(
  admin: Admin,
  userId: string,
  itemType: string,
  zone: number,
  tier: number,
): Promise<void> {
  const column = masteryColumnOfItemType(itemType);
  if (!column) return;
  const gain = masteryXpGain({ zone: Math.max(1, zone), craftTier: Math.max(1, tier) });
  const current = await masteryXpOf(admin, userId, column);
  await admin
    .from('profiles')
    .update({ [column]: current + gain })
    .eq('id', userId);
}

/* ------------------------------------------------------------------ *
 * UNE TENTATIVE DE CRAFT                                              *
 * ------------------------------------------------------------------ *
 * Chaque atelier sait produire UN objet : payer, tirer, insérer,      *
 * rendre l'objet et l'XP gagnée. C'est la brique que partagent le     *
 * craft à l'unité (le rituel : un clic = une pièce) et l'auto-craft   *
 * (la même chose en boucle, côté serveur). L'appelant persiste l'XP : *
 * l'unité l'écrit tout de suite, l'auto une seule fois à la fin.      *
 *                                                                     *
 * Le coût, lui, est vérifié et débité à CHAQUE tentative — même en    *
 * auto. Un ledger en mémoire irait plus vite mais ne verrait pas les  *
 * dépenses d'un autre onglet pendant la série.                        */

type CraftOnce = { item: Record<string, unknown>; xpGain: number };

/**
 * Craft d'une arme/armure. `masteryLevel` pilote les probas de rareté ; `boss`
 * (l'essence choisie, ou `null`) oriente les stats secondaires et s'ajoute au coût.
 */
async function craftWeaponOnce(
  admin: Admin,
  userId: string,
  arc: number,
  costMult: number,
  base: ForgeBase,
  mat: ForgeMaterialTheme,
  boss: BossMaterial | null,
  masteryLevel: number,
): Promise<CraftOnce | { error: string }> {
  const recipe: Recipe = scaleRecipe(craftRecipe(mat, boss), costMult);
  const check = await checkCost(admin, userId, recipe, arc);
  if ('error' in check) return { error: check.error };
  await consumeCost(admin, userId, recipe, check.gold, check.res, arc);

  const rng = createRng(Math.floor(Math.random() * 2_147_483_647));
  const crafted = craftItem(base, mat, boss, rng, tierGearMult(arc), masteryLevel);
  // Stat SECONDAIRE des modèles qui en portent une (Arc → crit, Dague →
  // esquive). Déterministe : la zone du matériau fixe la puissance.
  const wp = weaponPassiveFor(base, mat);
  const { data: item } = await admin
    .from('items')
    .insert({
      owner_id: userId,
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
      craft_cost: recipe.materials,
      ...(wp ? { passive_type: wp.type, passive_value: wp.pct, base_passive_value: wp.pct } : {}),
    })
    .select()
    .single();

  return { item, xpGain: forgeMasteryXpGain(mat) };
}

/** Sertissage d'un bijou. Aucune stat brute — uniquement un passif en %. */
async function craftJewelOnce(
  admin: Admin,
  userId: string,
  arc: number,
  costMult: number,
  mat: ForgeMaterialTheme,
  gem: GemDef,
  masteryLevel: number,
): Promise<CraftOnce | { error: string }> {
  const recipe: Recipe = scaleRecipe(jewelRecipe(mat, gem), costMult);
  const check = await checkCost(admin, userId, recipe, arc);
  if ('error' in check) return { error: check.error };
  await consumeCost(admin, userId, recipe, check.gold, check.res, arc);

  const rng = createRng(Math.floor(Math.random() * 2_147_483_647));
  const crafted = craftJewel(mat, gem, rng, masteryLevel);
  // Le passif n'est PAS scalé par le tier (un % de tier N reste un %) : seul le
  // tier de la pile change.
  const { data: item } = await admin
    .from('items')
    .insert({
      owner_id: userId,
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
      craft_cost: recipe.materials,
    })
    .select()
    .single();

  return { item, xpGain: jewelMasteryXpGain(mat) };
}

/**
 * Façonnage d'une relique. Stats brutes scalées au tier de l'arc. `boss`
 * (l'essence choisie, ou `null`) décide des stats secondaires et s'ajoute au coût
 * — même règle qu'à la forge.
 */
async function craftRelicOnce(
  admin: Admin,
  userId: string,
  arc: number,
  costMult: number,
  base: RelicBase,
  mat: ForgeMaterialTheme,
  boss: BossMaterial | null,
  masteryLevel: number,
): Promise<CraftOnce | { error: string }> {
  const recipe: Recipe = scaleRecipe(relicRecipe(mat, boss), costMult);
  const check = await checkCost(admin, userId, recipe, arc);
  if ('error' in check) return { error: check.error };
  await consumeCost(admin, userId, recipe, check.gold, check.res, arc);

  const rng = createRng(Math.floor(Math.random() * 2_147_483_647));
  const crafted = craftRelic(base, mat, boss, rng, masteryLevel);
  const tm = tierGearMult(arc);
  const atk = Math.round(crafted.atk_bonus * tm);
  const def = Math.round(crafted.def_bonus * tm);
  const hp = Math.round(crafted.hp_bonus * tm);
  const { data: item } = await admin
    .from('items')
    .insert({
      owner_id: userId,
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
      craft_cost: recipe.materials,
    })
    .select()
    .single();

  return { item, xpGain: relicMasteryXpGain(mat) };
}

/**
 * Le tier de matériaux est débloqué par l'ARC COURANT du joueur : l'arc N ouvre
 * le tier N (cf. ARCS, où `index === tier`).
 *
 * Ce gate lisait `player_arc_progress` — une table qui N'EXISTE PAS en base. Elle
 * venait de l'ancien boss d'arc SOLO (migration 0033), jamais activé : le design
 * a basculé sur un event communautaire, qui écrit `player_arc.current_arc`. Le
 * front avait déjà cessé d'interroger ces tables mortes (cf. ArcBossComingSoon) ;
 * la forge, elle, était restée dessus.
 *
 * Le bug était DORMANT : tous les composants sont en tier 1 aujourd'hui, et la
 * fonction sortait avant la requête. Il aurait mordu le jour où l'arc 2 apporte
 * ses matériaux — la requête échoue en silence, `cleared` reste vide, et le tier 2
 * aurait été verrouillé pour tout le monde, sans erreur ni log.
 *
 * Pur désormais : l'appelant a déjà l'arc en main (`currentArcOf`), inutile de
 * retourner en base.
 */
function craftTierError(craftTier: number, arc: number): string | null {
  if (craftTier <= arc) return null;
  return `Tier ${craftTier} verrouillé — il s'ouvre à l'Arc ${craftTier}`;
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
  // --------------------------------------------------------------- RECYCLAGE
  // Détruit des objets et rembourse la MOITIÉ des matériaux de leur craft.
  //
  // Remplace le RPC SQL `delete_items` : les recettes vivent en TypeScript, la
  // fonction SQL ne pouvait pas les lire. Les règles de suppression restent les
  // mêmes — objet possédé, ni verrouillé, ni équipé.
  if (body.action === 'salvage') {
    const ids = body.item_ids;
    if (!Array.isArray(ids) || ids.some((x) => typeof x !== 'string')) {
      return json({ error: 'item_ids invalide' }, 400);
    }
    const itemIds = [...new Set(ids as string[])];
    if (itemIds.length === 0) return json({ deleted: 0, refunded: {} });

    const { data: rows } = await admin
      .from('items')
      .select(
        'id, name, tier, locked, craft_cost, set_id, base_atk_bonus, base_def_bonus, base_hp_bonus',
      )
      .in('id', itemIds)
      .eq('owner_id', user.id)
      .eq('locked', false);
    const items = (rows ?? []) as {
      id: string;
      name: string;
      tier: number;
      craft_cost: { key: string; qty: number }[] | null;
      set_id: string | null;
      base_atk_bonus: number;
      base_def_bonus: number;
      base_hp_bonus: number;
    }[];
    if (items.length === 0) return json({ deleted: 0, refunded: {} });

    // Un objet ÉQUIPÉ n'est pas recyclable (même garde que l'ancien RPC).
    const { data: heroRows } = await admin
      .from('heroes')
      .select('equipped_weapon_id, equipped_armor_id, equipped_jewel_id, equipped_relic_id')
      .eq('owner_id', user.id);
    const equipped = new Set<string>();
    for (const h of (heroRows ?? []) as Record<string, string | null>[]) {
      for (const v of Object.values(h)) if (v) equipped.add(v);
    }
    const salvageable = items.filter((i) => !equipped.has(i.id));
    if (salvageable.length === 0) return json({ deleted: 0, refunded: {} });

    // Coût du craft : enregistré à la fabrication, sinon DÉDUIT du suffixe du nom
    // (« Arc runique » → composant de la zone 6). Les objets antérieurs à cette
    // fonctionnalité, comme ceux octroyés, n'ont pas de coût stocké.
    /**
     * Repli pour les pièces de set ANTÉRIEURES à l'enregistrement du coût.
     *
     * Leur nom (« Grimoire du Tacticien (Atours du Tacticien) ») ne porte aucun
     * suffixe de zone : la déduction par le nom rendait toujours zéro matériau.
     * On retrouve donc le modèle par son libellé, puis la zone en cherchant le
     * matériau dont les stats REPRODUISENT celles stockées — `craftSetPieceStats`
     * est déterministe, l'inversion est donc exacte à l'arrondi près.
     */
    const setCostOf = (
      it: (typeof salvageable)[number],
    ): { key: string; qty: number }[] | null => {
      if (!it.set_id) return null;
      const piece = SET_PIECES.find((p) => p.setId === it.set_id && it.name.startsWith(p.label));
      if (!piece) return null;
      const tm = tierGearMult(it.tier);
      let best: { mat: (typeof FORGE_MATERIALS)[number]; err: number } | null = null;
      for (const mat of FORGE_MATERIALS) {
        const s = craftSetPieceStats(piece, mat);
        const err =
          Math.abs(Math.round(s.atk * tm) - it.base_atk_bonus) +
          Math.abs(Math.round(s.def * tm) - it.base_def_bonus) +
          Math.abs(Math.round(s.hp * tm) - it.base_hp_bonus);
        if (!best || err < best.err) best = { mat, err };
      }
      return best ? setPieceRecipe(piece, best.mat).materials : null;
    };

    const costOf = (it: (typeof salvageable)[number]): { key: string; qty: number }[] => {
      if (Array.isArray(it.craft_cost) && it.craft_cost.length > 0) return it.craft_cost;
      const fromSet = setCostOf(it);
      if (fromSet) return fromSet;
      // `includes` et non `endsWith` : un bijou s'appelle « Amulette des marais
      // DE SÈVE » — le suffixe du composant n'y est pas en dernier. On teste du
      // suffixe le plus long au plus court pour qu'un libellé court inclus dans
      // un autre ne l'emporte pas.
      const mat = [...FORGE_MATERIALS]
        .sort((a, b) => b.suffix.length - a.suffix.length)
        .find((m) => it.name.includes(m.suffix));
      return mat ? mat.materials : [];
    };

    // Cumul par (ressource, tier) : chaque objet rembourse dans SON tier d'arc.
    const refund = new Map<string, { resource: string; tier: number; qty: number }>();
    for (const it of salvageable) {
      for (const m of costOf(it)) {
        // Arrondi INFÉRIEUR : fabriquer puis recycler doit toujours être une perte
        // sèche, jamais une boucle rentable.
        const qty = Math.floor(m.qty * 0.5);
        if (qty <= 0) continue;
        const k = `${m.key}|${it.tier}`;
        const cur = refund.get(k);
        if (cur) cur.qty += qty;
        else refund.set(k, { resource: m.key, tier: it.tier, qty });
      }
    }

    for (const r of refund.values()) {
      const { data: existing } = await admin
        .from('player_resources')
        .select('amount')
        .eq('player_id', user.id)
        .eq('resource', r.resource)
        .eq('tier', r.tier)
        .maybeSingle();
      await admin.from('player_resources').upsert(
        {
          player_id: user.id,
          resource: r.resource,
          tier: r.tier,
          amount: ((existing?.amount as number | undefined) ?? 0) + r.qty,
        },
        { onConflict: 'player_id,resource,tier' },
      );
    }

    await admin
      .from('items')
      .delete()
      .in('id', salvageable.map((i) => i.id))
      .eq('owner_id', user.id);

    const refunded: Record<string, number> = {};
    for (const r of refund.values()) refunded[r.resource] = (refunded[r.resource] ?? 0) + r.qty;
    return json({ deleted: salvageable.length, refunded });
  }

  if (body.action === 'craft') {
    if (typeof body.base_id !== 'string') return json({ error: 'base_id invalide' }, 400);
    if (typeof body.material_id !== 'string') return json({ error: 'material_id invalide' }, 400);
    const base = getBase(body.base_id);
    if (!base) return json({ error: 'Objet inconnu' }, 400);
    const mat = getMaterialTier(body.material_id);
    if (!mat) return json({ error: 'Matériau inconnu' }, 400);

    const tierError = craftTierError(mat.craftTier, arc);
    if (tierError) return json({ error: tierError }, 403);

    // Essence de boss : facultative (sans elle, pas de stat secondaire), mais si
    // elle est demandée elle doit exister — sinon on forgerait un objet muet en
    // ayant quand même prélevé le composant.
    const boss = resolveBossMaterial(body.boss_material_id);
    if ('error' in boss) return json({ error: boss.error }, 400);

    // Niveau de maîtrise de forge → pilote les probas de rareté (bon stuff plus
    // fréquent en montant). Lu AVANT le craft.
    const xp = await masteryXpOf(admin, user.id, 'forge_xp');
    const r = await craftWeaponOnce(
      admin,
      user.id,
      arc,
      forgeCostMult,
      base,
      mat,
      boss.boss,
      forgeLevelInfo(xp).level,
    );
    if ('error' in r) return json({ error: r.error }, 400);

    // Gain d'XP de forge (chaque craft fait progresser la maîtrise).
    await admin.from('profiles').update({ forge_xp: xp + r.xpGain }).eq('id', user.id);

    return json({ item: r.item, forge_xp: r.xpGain });
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

    const tierError = craftTierError(mat.craftTier, arc);
    if (tierError) return json({ error: tierError }, 403);

    // Niveau de maîtrise de joaillerie → pilote les probas de rareté (donc la
    // puissance du passif). Lu AVANT le sertissage.
    const xp = await masteryXpOf(admin, user.id, 'jewel_xp');
    const r = await craftJewelOnce(
      admin,
      user.id,
      arc,
      forgeCostMult,
      mat,
      gem,
      jewelLevelInfo(xp).level,
    );
    if ('error' in r) return json({ error: r.error }, 400);

    // Gain d'XP de joaillerie (chaque sertissage fait progresser la maîtrise).
    await admin.from('profiles').update({ jewel_xp: xp + r.xpGain }).eq('id', user.id);

    return json({ item: r.item, jewel_xp: r.xpGain });
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

    const tierError = craftTierError(mat.craftTier, arc);
    if (tierError) return json({ error: tierError }, 403);

    // Essence de boss : facultative (sans elle, la relique est mono-stat).
    const relicBoss = resolveBossMaterial(body.boss_material_id);
    if ('error' in relicBoss) return json({ error: relicBoss.error }, 400);

    // Niveau de maîtrise de reliquaire → pilote les probas de rareté (donc la
    // puissance de la relique). Lu AVANT le craft, comme forge et joaillerie.
    const xp = await masteryXpOf(admin, user.id, 'relic_xp');
    const r = await craftRelicOnce(
      admin,
      user.id,
      arc,
      forgeCostMult,
      base,
      mat,
      relicBoss.boss,
      relicLevelInfo(xp).level,
    );
    if ('error' in r) return json({ error: r.error }, 400);

    // Gain d'XP de reliquaire (chaque relique fait progresser la maîtrise).
    await admin.from('profiles').update({ relic_xp: xp + r.xpGain }).eq('id', user.id);

    return json({ item: r.item, relic_xp: r.xpGain });
  }

  // ------------------------------------------------------ FORGE SACRÉE (DIVIN)
  // Relique DIVINE : au-dessus d'Ultime, avec l'effet d'une gemme en plus de ses
  // stats. Réservée à l'Arc 2 — c'est le seul contenu qui EXIGE d'y être, pas
  // seulement de le pouvoir. Recette : Éclat sacré (event) + farm de zone + gemme.
  if (body.action === 'craft_divine_relic') {
    if (arc < 2) {
      return json({ error: 'La Forge Sacrée n’ouvre qu’en Arc 2.' }, 403);
    }
    if (typeof body.base_id !== 'string') return json({ error: 'base_id invalide' }, 400);
    if (typeof body.material_id !== 'string') return json({ error: 'material_id invalide' }, 400);
    if (typeof body.gem_id !== 'string') return json({ error: 'gem_id invalide' }, 400);
    const base = getRelicBase(body.base_id);
    if (!base) return json({ error: 'Modèle de relique inconnu' }, 400);
    const mat = getMaterialTier(body.material_id);
    if (!mat) return json({ error: 'Matériau inconnu' }, 400);
    const gem = getGem(body.gem_id);
    if (!gem) return json({ error: 'Gemme inconnue' }, 400);

    // Coût : l'Éclat sacré ne suit PAS forgeCostMult (c'est une monnaie d'event,
    // pas un matériau de zone) — mais le farm de zone, si. scaleRecipe multiplie
    // tout ; on le laisse tel quel, l'Éclat sacré à ×2.5 en Arc 2 reste voulu
    // (l'Arc 2 est plus cher partout). À réviser si ça se révèle punitif.
    const recipe = scaleRecipe(divineRelicRecipe(mat, gem), forgeCostMult);
    const check = await checkCost(admin, user.id, recipe, arc);
    if ('error' in check) return json({ error: check.error }, 400);
    await consumeCost(admin, user.id, recipe, check.gold, check.res, arc);

    const stats = divineRelicStats(base, mat);
    const tm = tierGearMult(arc);
    const atk = Math.round(stats.atk * tm);
    const def = Math.round(stats.def * tm);
    const hp = Math.round(stats.hp * tm);
    const passive = divineRelicPassive(gem);
    const { data: item } = await admin
      .from('items')
      .insert({
        owner_id: user.id,
        item_type: 'relic',
        name: divineRelicName(base, gem),
        // Divin n'est pas une rareté de l'échelle : on stocke 'ultimate' (le
        // sommet) et le sceau ✦ du nom + le passif sur une relique font le Divin.
        rarity: 'ultimate',
        weight: null,
        tier: arc,
        atk_bonus: atk,
        def_bonus: def,
        hp_bonus: hp,
        base_atk_bonus: atk,
        base_def_bonus: def,
        base_hp_bonus: hp,
        // `divineRelicPassive.value` = `gem.maxPct`, DÉJÀ en % entiers — même
        // convention que le passif d'un bijou en base (itemCombatPassive redivise
        // par 100 au combat). Surtout PAS de ×100 ici.
        passive_type: passive.type,
        passive_value: passive.value,
        base_passive_value: passive.value,
        craft_cost: recipe.materials,
      })
      .select()
      .single();

    return json({ item });
  }

  // ---------------------------------------------------------- AUTO CRAFT
  // La série d'auto-craft, jusqu'à la rareté visée. Elle vivait dans le
  // navigateur : jusqu'à 300 allers-retours HTTP séquentiels, perdus si l'onglet
  // se fermait, et un palier de déblocage que seul le front faisait respecter.
  // Elle vit maintenant ici : un appel, une décision serveur, un résultat.
  if (body.action === 'auto_craft') {
    const kind = body.kind;
    if (kind !== 'weapon' && kind !== 'jewel' && kind !== 'relic')
      return json({ error: 'kind invalide' }, 400);
    if (typeof body.target !== 'string' || !(AUTO_TARGETS as readonly string[]).includes(body.target))
      return json({ error: 'target invalide' }, 400);
    const target = body.target as AutoTarget;
    // Le front peut demander moins ; il ne peut pas demander plus.
    const asked = typeof body.max_attempts === 'number' ? body.max_attempts : AUTO_MAX_ATTEMPTS;
    const maxAttempts = Math.min(AUTO_MAX_ATTEMPTS, Math.max(1, Math.floor(asked)));

    const mat = typeof body.material_id === 'string' ? getMaterialTier(body.material_id) : null;
    if (!mat) return json({ error: 'Matériau inconnu' }, 400);
    const tierError = craftTierError(mat.craftTier, arc);
    if (tierError) return json({ error: tierError }, 403);

    // Résolution du plan AVANT la boucle : une entrée invalide doit échouer sec,
    // pas au milieu d'une série à moitié payée.
    const column: MasteryColumn =
      kind === 'weapon' ? 'forge_xp' : kind === 'jewel' ? 'jewel_xp' : 'relic_xp';
    let base: ForgeBase | null = null;
    let relicBase: RelicBase | null = null;
    let gem: GemDef | null = null;
    // L'essence est fixée pour TOUTE la série : c'est le plan du joueur, pas un
    // tirage. Elle est refacturée à chaque tentative comme le reste du coût.
    let boss: BossMaterial | null = null;
    if (kind === 'weapon' || kind === 'relic') {
      // Forge et Autel partagent la même règle d'essence ; seule la joaillerie
      // s'en passe (son « boss » à elle, c'est la gemme).
      const resolved = resolveBossMaterial(body.boss_material_id);
      if ('error' in resolved) return json({ error: resolved.error }, 400);
      boss = resolved.boss;
    }
    if (kind === 'weapon') {
      base = (typeof body.base_id === 'string' ? getBase(body.base_id) : null) ?? null;
      if (!base) return json({ error: 'Objet inconnu' }, 400);
    } else if (kind === 'relic') {
      relicBase = (typeof body.base_id === 'string' ? getRelicBase(body.base_id) : null) ?? null;
      if (!relicBase) return json({ error: 'Relique inconnue' }, 400);
    } else {
      gem = (typeof body.gem_id === 'string' ? getGem(body.gem_id) : null) ?? null;
      if (!gem) return json({ error: 'Gemme inconnue' }, 400);
    }

    const startXp = await masteryXpOf(admin, user.id, column);
    // Le palier d'auto est désormais VERROUILLÉ ici. Le front le gardait seul :
    // l'endpoint offrait le confort du late game à n'importe quel novice.
    if (!autoUnlocked(masteryLevelInfo(startXp).level)) {
      return json({ error: `L'auto se débloque à la maîtrise Nv.${AUTO_UNLOCK_LEVEL}` }, 403);
    }

    const items: Record<string, unknown>[] = [];
    let xp = startXp;
    let reached = false;
    let stopped: string | null = null;

    for (let n = 0; n < maxAttempts; n++) {
      // La maîtrise monte PENDANT la série : on la redérive à chaque tentative,
      // exactement comme le faisait la boucle client en relisant le profil.
      const level = masteryLevelInfo(xp).level;
      const r =
        kind === 'weapon'
          ? await craftWeaponOnce(admin, user.id, arc, forgeCostMult, base!, mat, boss, level)
          : kind === 'relic'
            ? await craftRelicOnce(admin, user.id, arc, forgeCostMult, relicBase!, mat, boss, level)
            : await craftJewelOnce(admin, user.id, arc, forgeCostMult, mat, gem!, level);

      // Plus de quoi payer : ce n'est pas une erreur, c'est la fin de la série.
      // Ce qui est déjà sorti est acquis.
      if ('error' in r) {
        stopped = r.error;
        break;
      }
      items.push(r.item);
      xp += r.xpGain;
      if (rarityRank(String(r.item.rarity)) >= rarityRank(target)) {
        reached = true;
        break;
      }
    }

    // XP persistée une seule fois : c'est le seul endroit où l'auto s'écarte du
    // craft à l'unité. Le coût, lui, est débité tentative par tentative.
    if (xp !== startXp) {
      await admin.from('profiles').update({ [column]: xp }).eq('id', user.id);
    }

    return json({ items, attempts: items.length, reached, xp_gain: xp - startXp, stopped });
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

    // Chaque arc a son PROPRE catalogue de sets : un set d'arc 1 ne se forge plus
    // dès l'arc 2 (et réciproquement) — ça force à changer de stratégie plutôt que
    // d'empiler l'ancien et le nouveau.
    if (set && setArc(set) !== arc) {
      return json({ error: `Ce set appartient à l'arc ${setArc(set)}, inaccessible depuis l'arc ${arc}.` }, 403);
    }

    // Verrou de sortie (V1.1) : les nouveaux sets ne sont forgeables qu'à la sortie.
    // Horloge SERVEUR (anti-triche), comme les autres gates de la mise à jour.
    if (set?.gatedUntilRelease) {
      const { data: cfgRows } = await admin
        .from('app_config')
        .select('key, value')
        .in('key', ['release_at', 'admin_ids']);
      const releaseAt = (cfgRows?.find((r) => r.key === 'release_at')?.value as string | null) ?? null;
      const adminIds: string[] = JSON.parse(cfgRows?.find((r) => r.key === 'admin_ids')?.value ?? '[]');
      if (!isReleasedFor(releaseAt, Date.now(), user.id, adminIds)) {
        return json({ error: 'Ce set arrive avec la mise à jour — patiente jusqu’à la sortie.' }, 403);
      }
    }

    const tierError = craftTierError(mat.craftTier, arc);
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
        // Oublié jusqu'ici, contrairement aux trois autres chemins de craft : sans
        // lui le recyclage retombait sur la déduction par le nom, qui ne peut PAS
        // marcher pour une pièce de set (son nom ne porte aucun suffixe de zone).
        // Les joueurs démantelaient donc leurs pièces pour zéro matériau.
        craft_cost: recipe.materials,
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
      .select(
        // `tier` : chiffre l'XP de joaillerie créditée par tentative (cf. `grantUpgradeMasteryXp`).
        'id, name, item_type, tier, upgrade_level, upgrade_fails, passive_type, passive_value, base_passive_value',
      )
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
    const jewelZone = materialZoneOfName(item.name) || 1;
    const recipe = scaleRecipe(
      refineCost(item.upgrade_level, zoneFarmMaterial(jewelZone), gem.id),
      forgeCostMult,
    );
    const check = await checkCost(admin, user.id, recipe, arc);
    if ('error' in check) return json({ error: check.error }, 400);

    await consumeCost(admin, user.id, recipe, check.gold, check.res, arc);

    // Même règle que le renforcement : la maîtrise de joaillerie bonifie la réussite.
    const refineMastery = await upgradeMasteryLevel(admin, user.id, item.item_type);

    // Acharnement : les échecs consécutifs déjà encaissés sur CE bijou bonifient
    // ce tirage, et la moindre réussite remet le compteur à zéro.
    const fails = item.upgrade_fails ?? 0;

    const rng = createRng(Math.floor(Math.random() * 2_147_483_647));
    const success = rng.next() < refineSuccessChance(item.upgrade_level, refineMastery, fails);
    const newLevel = success ? item.upgrade_level + 1 : Math.max(0, item.upgrade_level - 1);
    const newValue = refinedJewelPct(base, newLevel, gem);

    await admin
      .from('items')
      .update({
        upgrade_level: newLevel,
        upgrade_fails: success ? 0 : fails + 1,
        passive_value: newValue,
        base_passive_value: base,
      })
      .eq('id', item.id);

    await grantUpgradeMasteryXp(admin, user.id, item.item_type, jewelZone, item.tier ?? arc);

    return json({ success, upgrade_level: newLevel, passive_value: newValue });
  }

  // --------------------------------------------------------------- BLESS
  // Bénédiction d'arme : amplifie l'amplificateur de type de l'arme, plafonnée par
  // son niveau de renforcement. Déterministe (la larme astrale est le vrai coût).
  // Une fois bénie, l'arme ne peut plus être renforcée (cf. UPGRADE).
  //
  // Ouverte dès l'ARC 1. Le verrou `arc < 2` a sauté : la larme astrale tombe sur
  // le boss de CHAQUE donjon, tous tiers confondus (0089), la ressource était donc
  // déjà accessible en arc 1 — seule l'action était fermée. Le vrai frein reste le
  // plafond `blessing_level ≤ upgrade_level` et la rareté de la larme.
  if (body.action === 'bless') {
    if (typeof body.item_id !== 'string') return json({ error: 'item_id invalide' }, 400);

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
      .select(
        // `craft_cost` + `tier` : indispensables à `setPieceZone` (zone réelle
        // d'une pièce de set, que son nom ne porte pas).
        'id, name, set_id, item_type, tier, craft_cost, upgrade_level, upgrade_fails, blessing_level, base_atk_bonus, base_def_bonus, base_hp_bonus',
      )
      .eq('id', body.item_id)
      .eq('owner_id', user.id)
      .single();
    if (!item) return json({ error: 'Objet introuvable' }, 404);
    // Un bijou CLASSIQUE n'a que son passif : il se raffine (`refine_jewel`), il
    // ne se renforce pas. Un bijou de SET, lui, n'a pas de passif du tout — il
    // porte des stats brutes comme n'importe quelle pièce de set. Il tombait donc
    // entre les deux systèmes et restait le seul équipement du jeu impossible à
    // améliorer, alors que les reliques de set passent bien par ici.
    if (item.item_type === 'jewel' && !item.set_id)
      return json({ error: 'Les bijoux se raffinent à la Joaillerie' }, 400);
    if ((item.blessing_level ?? 0) > 0)
      return json({ error: 'Une arme bénie ne peut plus être renforcée' }, 400);
    if (item.upgrade_level >= UPGRADE_MAX) return json({ error: 'Niveau maximum atteint' }, 400);

    // Matériau consommé = farm de la zone de l'objet. Le nom d'une pièce de set
    // ne porte pas de suffixe : sa zone se retrouve via `craft_cost` (cf.
    // `setPieceZone`), et non plus figée à 10 — améliorer une pièce forgée en
    // chêne exigeait sinon de la poussière d'étoile.
    const zone = item.set_id ? setPieceZone(item) : materialZoneOfName(item.name);
    const recipe = scaleRecipe(upgradeCost(item.upgrade_level, zoneFarmMaterial(zone || 1)), forgeCostMult);
    const check = await checkCost(admin, user.id, recipe, arc);
    if ('error' in check) return json({ error: check.error }, 400);

    await consumeCost(admin, user.id, recipe, check.gold, check.res, arc);

    // La MAÎTRISE de l'atelier responsable bonifie la réussite : forge pour les
    // armes/armures, reliquaire pour les reliques. Un maître forgeron ne doit pas
    // rater ses renforcements aussi souvent qu'un novice.
    const masteryLevel = await upgradeMasteryLevel(admin, user.id, item.item_type);

    // ACHARNEMENT : chaque échec consécutif sur CET objet bonifie le tirage
    // suivant, la réussite remet le compteur à zéro. Le compteur suit l'objet et
    // pas le niveau : reculer d'un cran n'efface pas la série noire encaissée.
    const fails = item.upgrade_fails ?? 0;

    const rng = createRng(Math.floor(Math.random() * 2_147_483_647));
    const success = rng.next() < upgradeSuccessChance(item.upgrade_level, masteryLevel, fails);
    const newLevel = success
      ? item.upgrade_level + 1
      : Math.max(0, item.upgrade_level - 1);

    await admin
      .from('items')
      .update({
        upgrade_level: newLevel,
        upgrade_fails: success ? 0 : fails + 1,
        atk_bonus: effectiveBonus(item.base_atk_bonus, newLevel),
        def_bonus: effectiveBonus(item.base_def_bonus, newLevel),
        hp_bonus: effectiveBonus(item.base_hp_bonus, newLevel),
      })
      .eq('id', item.id);

    await grantUpgradeMasteryXp(admin, user.id, item.item_type, zone, item.tier ?? arc);

    return json({ success, upgrade_level: newLevel });
  }

  return json({ error: 'Action inconnue' }, 400);
});
