/**
 * Forge : craft d'objets SPÉCIFIQUES (base × composant de zone) et amélioration.
 * - La base (Grande épée, Sceptre, Armure de plaques…) fixe le type, le poids
 *   et le profil de stats.
 * - Le composant vient d'une zone et THÉMATISE l'objet : nom ("Épée de givre"),
 *   puissance croissante avec la zone, et bonus de stats liés au thème.
 * - La rareté est tirée avec des % GLOBAUX identiques pour tous les crafts.
 * - Les zones 1-10 forment le Tier de craft 1 ; chaque palier de 10 zones
 *   futures débloquera le tier suivant (verrouillé côté serveur).
 * Pur et partagé front + Edge Function.
 */
import { rollBonuses, RARITY_MULT, type ItemType, type Rarity, type ItemWeight } from './loot.ts';
import type { Rng } from '../combat/prng.ts';

export const UPGRADE_MAX = 10;
const UPGRADE_STEP = 0.1;

/** Bonus effectif d'un objet à un niveau d'amélioration donné. */
export function effectiveBonus(base: number, upgradeLevel: number): number {
  return Math.round(base * (1 + UPGRADE_STEP * upgradeLevel));
}

/** Nombre de zones par tier de craft (palier). */
export const ZONES_PER_CRAFT_TIER = 10;

/** Tier de craft débloqué pour un nombre de zones terminées (boss battu). */
export function unlockedCraftTier(zonesCompleted: number): number {
  return 1 + Math.floor(zonesCompleted / ZONES_PER_CRAFT_TIER);
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

/** % de rareté GLOBAUX : identiques quel que soit l'objet ou le composant. */
export const CRAFT_RARITY_WEIGHTS: Record<Rarity, number> = {
  poor: 30,
  common: 40,
  uncommon: 18,
  advanced: 9,
  ultimate: 3,
};

/** Un modèle d'objet forgeable : fixe le type, le poids et le profil de stats. */
export type ForgeBase = {
  id: string;
  label: string;
  icon: string;
  itemType: 'weapon' | 'armor';
  weight: ItemWeight;
  /** Biais de stats propre au modèle (multiplicateurs). */
  bias: { atk: number; def: number; hp: number };
};

export const FORGE_BASES: ForgeBase[] = [
  // Armes
  {
    id: 'grande_epee',
    label: 'Grande épée',
    icon: '🗡️',
    itemType: 'weapon',
    weight: 'heavy',
    bias: { atk: 1.15, def: 1, hp: 1 },
  },
  {
    id: 'epee',
    label: 'Épée',
    icon: '⚔️',
    itemType: 'weapon',
    weight: 'medium',
    bias: { atk: 1, def: 1, hp: 1 },
  },
  {
    id: 'dague',
    label: 'Dague',
    icon: '🔪',
    itemType: 'weapon',
    weight: 'light',
    bias: { atk: 0.9, def: 1, hp: 1 },
  },
  {
    id: 'marteau',
    label: 'Marteau de guerre',
    icon: '🔨',
    itemType: 'weapon',
    weight: 'heavy',
    bias: { atk: 1.1, def: 1, hp: 1 },
  },
  {
    id: 'sceptre',
    label: 'Sceptre',
    icon: '🪄',
    itemType: 'weapon',
    weight: 'light',
    bias: { atk: 0.95, def: 1, hp: 1 },
  },
  {
    id: 'arc',
    label: 'Arc',
    icon: '🏹',
    itemType: 'weapon',
    weight: 'medium',
    bias: { atk: 1.05, def: 1, hp: 1 },
  },
  // Armures
  {
    id: 'plaques',
    label: 'Armure de plaques',
    icon: '🛡️',
    itemType: 'armor',
    weight: 'heavy',
    bias: { atk: 1, def: 1.2, hp: 0.95 },
  },
  {
    id: 'mailles',
    label: 'Cotte de mailles',
    icon: '⛓️',
    itemType: 'armor',
    weight: 'medium',
    bias: { atk: 1, def: 1, hp: 1 },
  },
  {
    id: 'tunique',
    label: 'Tunique renforcée',
    icon: '🥋',
    itemType: 'armor',
    weight: 'light',
    bias: { atk: 1, def: 0.85, hp: 1.15 },
  },
];

/**
 * Un composant de forge, lié à une zone : fixe le coût, la puissance,
 * le nom ("de givre") et le THÈME de stats de l'objet forgé.
 */
export type ForgeMaterialTheme = {
  id: string;
  label: string;
  /** Suffixe du nom généré (invariant en genre) : "Épée de givre"… */
  suffix: string;
  /** Zone d'origine (1-based) — sert au tri et à la lisibilité. */
  zone: number;
  /** Palier de craft : zones 1-10 = tier 1, zones 11-20 = tier 2… */
  craftTier: number;
  gold: number;
  materials: { key: string; qty: number }[];
  /** Puissance de base des stats (avant rareté et biais). */
  magnitude: number;
  /** Bonus thématiques (fraction de la magnitude, ajoutés au roll). */
  theme: Partial<Record<'atk' | 'def' | 'hp', number>>;
};

export const FORGE_MATERIALS: ForgeMaterialTheme[] = [
  {
    id: 'chene',
    label: 'Chêne',
    suffix: 'en chêne',
    zone: 1,
    craftTier: 1,
    gold: 120,
    materials: [{ key: 'ecorce', qty: 10 }],
    magnitude: 6,
    theme: {},
  },
  {
    id: 'givre',
    label: 'Givre',
    suffix: 'de givre',
    zone: 2,
    craftTier: 1,
    gold: 260,
    materials: [{ key: 'cristal', qty: 10 }],
    magnitude: 9,
    theme: { def: 0.4 },
  },
  {
    id: 'sables',
    label: 'Sable noir',
    suffix: 'des sables',
    zone: 3,
    craftTier: 1,
    gold: 450,
    materials: [{ key: 'sable_noir', qty: 10 }],
    magnitude: 12,
    theme: { atk: 0.3 },
  },
  {
    id: 'marais',
    label: 'Essence des marais',
    suffix: 'des marais',
    zone: 4,
    craftTier: 1,
    gold: 700,
    materials: [
      { key: 'spore', qty: 12 },
      { key: 'coeur_hydre', qty: 1 },
    ],
    magnitude: 15,
    theme: { hp: 0.6 },
  },
  {
    id: 'obsidienne',
    label: 'Obsidienne',
    suffix: "d'obsidienne",
    zone: 5,
    craftTier: 1,
    gold: 1000,
    materials: [
      { key: 'obsidienne', qty: 12 },
      { key: 'braise_eternelle', qty: 1 },
    ],
    magnitude: 19,
    theme: { atk: 0.5 },
  },
  {
    id: 'runique',
    label: 'Rune',
    suffix: 'runique',
    zone: 6,
    craftTier: 1,
    gold: 1400,
    materials: [
      { key: 'rune', qty: 12 },
      { key: 'fragment_titan', qty: 1 },
    ],
    magnitude: 23,
    theme: { def: 0.3, hp: 0.3 },
  },
  {
    id: 'abysses',
    label: 'Nacre noire',
    suffix: 'des abysses',
    zone: 7,
    craftTier: 1,
    gold: 1900,
    materials: [
      { key: 'nacre_noire', qty: 14 },
      { key: 'encre_kraken', qty: 2 },
    ],
    magnitude: 27,
    theme: { hp: 0.8 },
  },
  {
    id: 'tempete',
    label: "Plume d'orage",
    suffix: 'de tempête',
    zone: 8,
    craftTier: 1,
    gold: 2500,
    materials: [
      { key: 'plume_orage', qty: 14 },
      { key: 'foudre_condensee', qty: 2 },
    ],
    magnitude: 32,
    theme: { atk: 0.6 },
  },
  {
    id: 'ombre',
    label: 'Ombre pure',
    suffix: "d'ombre",
    zone: 9,
    craftTier: 1,
    gold: 3200,
    materials: [
      { key: 'ombre_pure', qty: 14 },
      { key: 'coeur_ombre', qty: 2 },
    ],
    magnitude: 37,
    theme: { atk: 0.4, def: 0.2 },
  },
  {
    id: 'etoiles',
    label: "Poussière d'étoile",
    suffix: 'des étoiles',
    zone: 10,
    craftTier: 1,
    gold: 4000,
    materials: [
      { key: 'poussiere_etoile', qty: 16 },
      { key: 'essence_astrale', qty: 3 },
    ],
    magnitude: 42,
    theme: { atk: 0.4, def: 0.4, hp: 0.4 },
  },
];

export function getBase(id: string): ForgeBase | undefined {
  return FORGE_BASES.find((b) => b.id === id);
}

export function getMaterialTier(id: string): ForgeMaterialTheme | undefined {
  return FORGE_MATERIALS.find((m) => m.id === id);
}

function pickRarity(weights: Record<Rarity, number>, rng: Rng): Rarity {
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

/** Construit l'objet pour une rareté donnée (partagé craft réel / ranges). */
function buildCraft(base: ForgeBase, mat: ForgeMaterialTheme, rarity: Rarity): CraftResult {
  const rolled = rollBonuses(base.itemType, mat.magnitude * 1.5, RARITY_MULT[rarity]);
  const themed = (k: 'atk' | 'def' | 'hp'): number =>
    Math.round((mat.theme[k] ?? 0) * mat.magnitude * RARITY_MULT[rarity]);
  return {
    item_type: base.itemType,
    name: `${base.label} ${mat.suffix}`,
    rarity,
    weight: base.weight,
    tier: mat.craftTier,
    atk_bonus: Math.round(rolled.atk_bonus * base.bias.atk) + themed('atk'),
    def_bonus: Math.round(rolled.def_bonus * base.bias.def) + themed('def'),
    hp_bonus: Math.round(rolled.hp_bonus * base.bias.hp) + themed('hp'),
  };
}

/**
 * Fabrique l'objet `base` avec le composant `mat`.
 * Seule la rareté est tirée (% globaux) ; les stats sont ensuite déterministes.
 */
export function craftItem(base: ForgeBase, mat: ForgeMaterialTheme, rng: Rng): CraftResult {
  return buildCraft(base, mat, pickRarity(CRAFT_RARITY_WEIGHTS, rng));
}

export type CraftStatRanges = {
  atk: [number, number];
  def: [number, number];
  hp: [number, number];
};

/**
 * Range de stats d'un craft, de la rareté Médiocre (−20 %) à Ultime (+35 %).
 * Les stats étant déterministes par rareté, la range est exactement l'écart
 * entre le pire et le meilleur palier de rareté — affichée avant de crafter.
 */
export function craftRanges(base: ForgeBase, mat: ForgeMaterialTheme): CraftStatRanges {
  const lo = buildCraft(base, mat, 'poor');
  const hi = buildCraft(base, mat, 'ultimate');
  return {
    atk: [lo.atk_bonus, hi.atk_bonus],
    def: [lo.def_bonus, hi.def_bonus],
    hp: [lo.hp_bonus, hi.hp_bonus],
  };
}
