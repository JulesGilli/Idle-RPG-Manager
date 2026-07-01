/**
 * Forge : recettes de craft (à rareté ALÉATOIRE), coûts et taux d'amélioration.
 * Chaque objet forgé est indépendant (nom généré, rareté tirée). Pur et partagé.
 * Armes et armures pour l'instant ; bijoux/reliques plus tard.
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

/** Coût pour passer de `level` à `level+1`. */
export type Recipe = { gold: number; materials: { key: string; qty: number }[] };
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

/* --------------------------------------------------------------- CRAFT ---- */

/** Une recette : coût fixe, mais la rareté obtenue est aléatoire (pondérée). */
export type CraftRecipe = {
  id: string;
  label: string;
  gold: number;
  materials: { key: string; qty: number }[];
  rarityWeights: Partial<Record<Rarity, number>>;
};

export const CRAFT_RECIPES: CraftRecipe[] = [
  {
    id: 'rudimentaire',
    label: 'Forge rudimentaire',
    gold: 120,
    materials: [{ key: 'ecorce', qty: 10 }],
    rarityWeights: { poor: 30, common: 55, uncommon: 15 },
  },
  {
    id: 'affinee',
    label: 'Forge affinée',
    gold: 400,
    materials: [{ key: 'cristal', qty: 10 }],
    rarityWeights: { common: 40, uncommon: 45, advanced: 15 },
  },
  {
    id: 'superieure',
    label: 'Forge supérieure',
    gold: 1200,
    materials: [
      { key: 'sable_noir', qty: 12 },
      { key: 'coeur_sylve', qty: 2 },
    ],
    rarityWeights: { uncommon: 35, advanced: 50, ultimate: 15 },
  },
  {
    id: 'maitre',
    label: 'Forge de maître',
    gold: 4000,
    materials: [
      { key: 'obsidienne', qty: 14 },
      { key: 'givre_pur', qty: 3 },
    ],
    rarityWeights: { advanced: 45, ultimate: 55 },
  },
];

export function getRecipe(id: string): CraftRecipe | undefined {
  return CRAFT_RECIPES.find((r) => r.id === id);
}

const CRAFT_MAGNITUDE: Record<Rarity, number> = {
  poor: 4,
  common: 6,
  uncommon: 12,
  advanced: 20,
  ultimate: 32,
};

const WEIGHTS: ItemWeight[] = ['light', 'medium', 'heavy'];

const EPITHETS = [
  'du Vagabond',
  "de l'Aube",
  'des Cendres',
  'du Torrent',
  "de l'Éclipse",
  'du Sanctuaire',
  'des Abysses',
  'du Zénith',
  'de Fer',
  'du Crépuscule',
  'de la Tempête',
  'des Braves',
];

function pickRarity(weights: Partial<Record<Rarity, number>>, rng: Rng): Rarity {
  const entries = Object.entries(weights) as [Rarity, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = rng.next() * total;
  for (const [rarity, w] of entries) {
    roll -= w;
    if (roll < 0) return rarity;
  }
  return entries[0]![0];
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

/** Fabrique un objet avec une rareté ALÉATOIRE selon la recette (tier 1). */
export function craftItem(
  recipe: CraftRecipe,
  itemType: 'weapon' | 'armor',
  rng: Rng,
): CraftResult {
  const rarity = pickRarity(recipe.rarityWeights, rng);
  const magnitude = CRAFT_MAGNITUDE[rarity] * 1.5;
  const weight = WEIGHTS[rng.int(0, WEIGHTS.length - 1)]!;
  const noun = itemType === 'weapon' ? 'Lame' : 'Armure';
  const epithet = EPITHETS[rng.int(0, EPITHETS.length - 1)]!;
  return {
    item_type: itemType,
    name: `${noun} ${epithet}`,
    rarity,
    weight,
    tier: 1,
    ...rollBonuses(itemType, magnitude, RARITY_MULT[rarity], rng),
  };
}
