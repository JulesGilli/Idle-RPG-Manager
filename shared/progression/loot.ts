/**
 * Loot pur et seedé. Échelle de raretés à 5 paliers, plafonnée par zone.
 * Taux et rareté montent avec la difficulté. Noms exclusifs à la zone (thème).
 * Matériaux : drop rare par combat, lié à la zone (calculé côté serveur).
 */
import type { Rng } from '../combat/prng.ts';

export type ItemType = 'weapon' | 'armor' | 'jewel' | 'relic';
export type Rarity = 'poor' | 'common' | 'uncommon' | 'advanced' | 'ultimate';
export type ItemWeight = 'light' | 'medium' | 'heavy';

export const RARITY_ORDER: Rarity[] = ['poor', 'common', 'uncommon', 'advanced', 'ultimate'];
export const RARITY_MULT: Record<Rarity, number> = {
  poor: 0.6,
  common: 1,
  uncommon: 1.6,
  advanced: 2.5,
  ultimate: 4,
};

export type ItemDrop = {
  item_type: ItemType;
  name: string;
  rarity: Rarity;
  weight: ItemWeight | null;
  tier: number;
  atk_bonus: number;
  def_bonus: number;
  hp_bonus: number;
};

const BASE_DROP = 0.06;
const ITEM_TYPES: ItemType[] = ['weapon', 'armor', 'jewel', 'relic'];
const WEIGHTS: ItemWeight[] = ['light', 'medium', 'heavy'];
const BOSS_DROP_CHANCE = 0.02;
export const BOSS_MATERIAL_CHANCE = 0.35;

const NOUN: Record<ItemType, string> = {
  weapon: 'Lame',
  armor: 'Armure',
  jewel: 'Amulette',
  relic: 'Relique',
};
const THEME_ADJ: Record<string, string> = {
  forest: 'sylvestre',
  ice: 'glaciale',
  desert: 'ardente',
  swamp: 'putride',
  volcano: 'volcanique',
  ruins: 'antique',
  abyss: 'abyssale',
  sky: 'céleste',
  shadow: 'ombrale',
  celestial: 'astrale',
};

function adj(theme: string): string {
  return THEME_ADJ[theme] ?? 'errante';
}

export function dropChance(difficulty: number): number {
  return Math.min(0.22, BASE_DROP * (1 + 0.05 * (difficulty - 1)));
}

/** Chance qu'un combat gagné donne le matériau de la zone (rare). */
export function materialDropChance(difficulty: number): number {
  return Math.min(0.3, 0.12 + 0.004 * difficulty);
}

type RarityEntry = { rarity: Rarity; weight: number };

function rarityTable(difficulty: number, maxRarity: Rarity): RarityEntry[] {
  const maxIdx = RARITY_ORDER.indexOf(maxRarity);
  const raw: Record<Rarity, number> = {
    poor: Math.max(4, 26 - difficulty),
    common: 45,
    uncommon: 12 + difficulty * 0.8,
    advanced: 3 + difficulty * 0.6,
    ultimate: 1 + difficulty * 0.4,
  };
  return RARITY_ORDER.map((r) => ({
    rarity: r,
    weight: RARITY_ORDER.indexOf(r) <= maxIdx ? raw[r] : 0,
  }));
}

function pickRarity(difficulty: number, maxRarity: Rarity, rng: Rng): Rarity {
  const table = rarityTable(difficulty, maxRarity);
  const total = table.reduce((s, r) => s + r.weight, 0);
  let roll = rng.next() * total;
  for (const entry of table) {
    roll -= entry.weight;
    if (roll < 0) return entry.rarity;
  }
  return 'common';
}

/** Probabilités par type/rareté et par combat gagné (pour l'affichage). */
export function lootOdds(
  difficulty: number,
  maxRarity: Rarity,
): { item_type: ItemType; rarity: Rarity; chance: number }[] {
  const table = rarityTable(difficulty, maxRarity).filter((r) => r.weight > 0);
  const total = table.reduce((s, r) => s + r.weight, 0);
  const perType = dropChance(difficulty) / ITEM_TYPES.length;
  const out: { item_type: ItemType; rarity: Rarity; chance: number }[] = [];
  for (const t of ITEM_TYPES) {
    for (const r of table) {
      out.push({ item_type: t, rarity: r.rarity, chance: perType * (r.weight / total) });
    }
  }
  return out;
}

/** Bonus d'un objet selon son type et une "magnitude" de puissance. */
export function rollBonuses(
  itemType: ItemType,
  magnitude: number,
  mult: number,
  rng: Rng,
): { atk_bonus: number; def_bonus: number; hp_bonus: number } {
  const base = Math.max(1, Math.round(magnitude));
  const scaled = (min: number, max: number): number => Math.round(rng.int(min, max) * mult);

  switch (itemType) {
    case 'weapon':
      return { atk_bonus: scaled(base, base + 4), def_bonus: 0, hp_bonus: 0 };
    case 'armor':
      return {
        atk_bonus: 0,
        def_bonus: scaled(base, base + 3),
        hp_bonus: scaled(base * 2, base * 2 + 6),
      };
    case 'jewel':
      return { atk_bonus: scaled(1, base), def_bonus: 0, hp_bonus: scaled(base, base * 2) };
    case 'relic':
      return {
        atk_bonus: scaled(1, Math.max(1, Math.floor(base / 2))),
        def_bonus: scaled(1, base),
        hp_bonus: scaled(base * 2, base * 3),
      };
  }
}

/** Drop normal (tier 1). Retourne null si pas de drop. */
export function rollLoot(
  difficulty: number,
  theme: string,
  maxRarity: Rarity,
  rng: Rng,
): ItemDrop | null {
  if (rng.next() >= dropChance(difficulty)) return null;

  const itemType = ITEM_TYPES[rng.int(0, ITEM_TYPES.length - 1)]!;
  const rarity = pickRarity(difficulty, maxRarity, rng);
  const weight = itemType === 'relic' ? null : WEIGHTS[rng.int(0, WEIGHTS.length - 1)]!;
  const magnitude = difficulty * 1.5;

  return {
    item_type: itemType,
    name: `${NOUN[itemType]} ${adj(theme)}`,
    rarity,
    weight,
    tier: 1,
    ...rollBonuses(itemType, magnitude, RARITY_MULT[rarity], rng),
  };
}

/** Item unique de boss (relique ultimate), très rare. */
export function rollBossItem(difficulty: number, theme: string, rng: Rng): ItemDrop | null {
  if (rng.next() >= BOSS_DROP_CHANCE) return null;
  const b = rollBonuses('relic', difficulty * 2, RARITY_MULT.ultimate, rng);
  return {
    item_type: 'relic',
    name: `Relique ${adj(theme)}`,
    rarity: 'ultimate',
    weight: null,
    tier: 1,
    atk_bonus: b.atk_bonus + difficulty,
    def_bonus: b.def_bonus + difficulty,
    hp_bonus: b.hp_bonus + difficulty * 3,
  };
}
