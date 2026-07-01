/**
 * Génération de loot pure et seedée. Le taux de drop et la rareté montent avec
 * la difficulté ; les noms d'objets sont exclusifs à la zone (thème). Les
 * reliques sont universelles (poids null). Loot de boss séparé (très rare).
 */
import type { Rng } from '../combat/prng.ts';

export type ItemType = 'weapon' | 'armor' | 'jewel' | 'relic';
export type Rarity = 'common' | 'rare' | 'epic';
export type ItemWeight = 'light' | 'medium' | 'heavy';
export type Theme = 'forest' | 'ice';

export type ItemDrop = {
  item_type: ItemType;
  name: string;
  rarity: Rarity;
  weight: ItemWeight | null; // null = relique (universelle)
  atk_bonus: number;
  def_bonus: number;
  hp_bonus: number;
};

const BASE_DROP = 0.06; // ~10× plus bas qu'avant
const ITEM_TYPES: ItemType[] = ['weapon', 'armor', 'jewel', 'relic'];
const WEIGHTS: ItemWeight[] = ['light', 'medium', 'heavy'];
const BOSS_DROP_CHANCE = 0.02; // item unique de boss

/** Chance qu'un combat gagné donne un drop (croît avec la difficulté). */
export function dropChance(difficulty: number): number {
  return Math.min(0.22, BASE_DROP * (1 + 0.05 * (difficulty - 1)));
}

type RarityEntry = { rarity: Rarity; weight: number; mult: number };

function rarityTable(difficulty: number): RarityEntry[] {
  return [
    { rarity: 'common', weight: Math.max(4, 70 - difficulty * 3), mult: 1 },
    { rarity: 'rare', weight: 25 + difficulty * 1.5, mult: 1.8 },
    { rarity: 'epic', weight: 5 + difficulty * 1.5, mult: 3 },
  ];
}

const THEME_NAMES: Record<Theme, Record<ItemType, Record<Rarity, string>>> = {
  forest: {
    weapon: { common: 'Branche noueuse', rare: 'Dague de ronce', epic: 'Lame de sève' },
    armor: { common: "Tunique d'écorce", rare: 'Armure de lierre', epic: "Carapace d'ent" },
    jewel: { common: 'Graine porte-bonheur', rare: 'Ambre ancien', epic: 'Cœur de bosquet' },
    relic: { common: 'Idole de mousse', rare: 'Totem sylvestre', epic: 'Relique du bosquet' },
  },
  ice: {
    weapon: { common: 'Pic de glace', rare: 'Éclat gelé', epic: 'Lame de givre' },
    armor: { common: 'Fourrure épaisse', rare: 'Plastron de glace', epic: 'Égide polaire' },
    jewel: { common: 'Perle gelée', rare: 'Cristal bleu', epic: 'Larme du dragon' },
    relic: { common: 'Fétiche gelé', rare: 'Totem de givre', epic: 'Relique polaire' },
  },
};

const BOSS_ITEM_NAME: Record<Theme, string> = {
  forest: 'Cœur du Gardien',
  ice: 'Écaille du Dragon de givre',
};

function pickRarity(difficulty: number, rng: Rng): RarityEntry {
  const table = rarityTable(difficulty);
  const total = table.reduce((s, r) => s + r.weight, 0);
  let roll = rng.next() * total;
  for (const entry of table) {
    roll -= entry.weight;
    if (roll < 0) return entry;
  }
  return table[0]!;
}

/** Probabilités par type/rareté et par combat gagné, pour une difficulté. */
export function lootOdds(
  difficulty: number,
): { item_type: ItemType; rarity: Rarity; chance: number }[] {
  const table = rarityTable(difficulty);
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

function statBlock(
  itemType: ItemType,
  difficulty: number,
  mult: number,
  rng: Rng,
): { atk_bonus: number; def_bonus: number; hp_bonus: number } {
  const base = difficulty * 2;
  const scaled = (min: number, max: number): number =>
    Math.round(rng.int(min, max) * mult * (1 + difficulty * 0.15));

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

/** Drop normal (retourne null si pas de drop). */
export function rollLoot(difficulty: number, theme: Theme, rng: Rng): ItemDrop | null {
  if (rng.next() >= dropChance(difficulty)) return null;

  const itemType = ITEM_TYPES[rng.int(0, ITEM_TYPES.length - 1)]!;
  const { rarity, mult } = pickRarity(difficulty, rng);
  const weight = itemType === 'relic' ? null : WEIGHTS[rng.int(0, WEIGHTS.length - 1)]!;

  return {
    item_type: itemType,
    name: THEME_NAMES[theme][itemType][rarity],
    rarity,
    weight,
    ...statBlock(itemType, difficulty, mult, rng),
  };
}

/** Item unique de boss (relique épique surpuissante), très rare. */
export function rollBossItem(difficulty: number, theme: Theme, rng: Rng): ItemDrop | null {
  if (rng.next() >= BOSS_DROP_CHANCE) return null;
  const stats = statBlock('relic', difficulty, 4, rng);
  return {
    item_type: 'relic',
    name: BOSS_ITEM_NAME[theme],
    rarity: 'epic',
    weight: null,
    atk_bonus: stats.atk_bonus + difficulty,
    def_bonus: stats.def_bonus + difficulty,
    hp_bonus: stats.hp_bonus + difficulty * 3,
  };
}
