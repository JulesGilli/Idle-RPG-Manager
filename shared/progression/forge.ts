/**
 * Forge : recettes de craft, coûts et taux d'amélioration, stats des objets
 * forgés. Pur et partagé (Edge Function + front). Les reliques/bijoux seront
 * craftables plus tard ; pour l'instant : armes et armures.
 */
import { rollBonuses, RARITY_MULT, type ItemType, type Rarity, type ItemWeight } from './loot.ts';
import type { Rng } from '../combat/prng.ts';

export const UPGRADE_MAX = 10;
const UPGRADE_STEP = 0.1;

/** Bonus effectif d'un objet à un niveau d'amélioration donné. */
export function effectiveBonus(base: number, upgradeLevel: number): number {
  return Math.round(base * (1 + UPGRADE_STEP * upgradeLevel));
}

/** Multiplicateur de tier (un tier supérieur écrase tout le tier inférieur). */
export function tierMult(tier: number): number {
  return Math.pow(8, tier - 1);
}

export type Recipe = { gold: number; materials: { key: string; qty: number }[] };
export type CraftRarity = 'common' | 'uncommon' | 'advanced' | 'ultimate';
export const CRAFT_RARITIES: CraftRarity[] = ['common', 'uncommon', 'advanced', 'ultimate'];

/** Recettes : matériaux de zone (+ composant de boss pour les hautes raretés). */
export const CRAFT_RECIPES: Record<CraftRarity, Recipe> = {
  common: { gold: 120, materials: [{ key: 'ecorce', qty: 10 }] },
  uncommon: { gold: 400, materials: [{ key: 'cristal', qty: 10 }] },
  advanced: {
    gold: 1200,
    materials: [
      { key: 'sable_noir', qty: 12 },
      { key: 'coeur_sylve', qty: 2 },
    ],
  },
  ultimate: {
    gold: 4000,
    materials: [
      { key: 'obsidienne', qty: 14 },
      { key: 'givre_pur', qty: 3 },
    ],
  },
};

const CRAFT_DIFFICULTY: Record<CraftRarity, number> = {
  common: 6,
  uncommon: 14,
  advanced: 24,
  ultimate: 36,
};

const WEIGHTS: ItemWeight[] = ['light', 'medium', 'heavy'];

/** Coût pour passer de `level` à `level+1`. */
export function upgradeCost(level: number): Recipe {
  return {
    gold: 100 * (level + 1) * (level + 1),
    materials: [{ key: 'ecorce', qty: 3 * (level + 1) }],
  };
}

/** Chance de réussite d'une amélioration depuis `level`. */
export function upgradeSuccessChance(level: number): number {
  return Math.max(0.2, 0.95 - 0.07 * level);
}

export type CraftResult = {
  item_type: ItemType;
  name: string;
  rarity: Rarity;
  weight: ItemWeight;
  tier: number;
  atk_bonus: number;
  def_bonus: number;
  hp_bonus: number;
};

/** Fabrique un objet (arme/armure) d'une rareté donnée (tier 1 pour l'instant). */
export function craftItem(
  itemType: 'weapon' | 'armor',
  rarity: CraftRarity,
  tier: number,
  rng: Rng,
): CraftResult {
  const magnitude = CRAFT_DIFFICULTY[rarity] * 1.5;
  const weight = WEIGHTS[rng.int(0, WEIGHTS.length - 1)]!;
  const name = itemType === 'weapon' ? 'Lame forgée' : 'Armure forgée';
  return {
    item_type: itemType,
    name,
    rarity,
    weight,
    tier,
    ...rollBonuses(itemType, magnitude, RARITY_MULT[rarity] * tierMult(tier), rng),
  };
}
