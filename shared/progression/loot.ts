/**
 * Génération de loot pure et seedée (même seed → même drop).
 * Utilisée par l'Edge Function pour attribuer l'équipement après une victoire.
 */
import type { Rng } from '../combat/prng.ts';

export type ItemType = 'weapon' | 'armor' | 'accessory';
export type Rarity = 'common' | 'rare' | 'epic';

export type ItemDrop = {
  item_type: ItemType;
  name: string;
  rarity: Rarity;
  atk_bonus: number;
  def_bonus: number;
  hp_bonus: number;
};

const DROP_CHANCE = 0.6;

const RARITY_TABLE: { rarity: Rarity; weight: number; mult: number }[] = [
  { rarity: 'common', weight: 65, mult: 1 },
  { rarity: 'rare', weight: 28, mult: 1.8 },
  { rarity: 'epic', weight: 7, mult: 3 },
];

const ITEM_NAMES: Record<ItemType, Record<Rarity, string>> = {
  weapon: { common: 'Épée usée', rare: 'Lame affûtée', epic: 'Fléau runique' },
  armor: { common: 'Cuir râpé', rare: 'Cotte de mailles', epic: 'Plastron mithril' },
  accessory: { common: 'Anneau terni', rare: 'Amulette gravée', epic: 'Talisman ancien' },
};

function pickRarity(rng: Rng): (typeof RARITY_TABLE)[number] {
  const total = RARITY_TABLE.reduce((sum, r) => sum + r.weight, 0);
  let roll = rng.next() * total;
  for (const entry of RARITY_TABLE) {
    roll -= entry.weight;
    if (roll < 0) return entry;
  }
  return RARITY_TABLE[0]!;
}

/**
 * Tire un drop pour un donjon de difficulté donnée. Retourne null si pas de drop.
 * Les bonus dépendent du type d'objet, de la difficulté et de la rareté.
 */
export function rollLoot(difficulty: number, rng: Rng): ItemDrop | null {
  if (rng.next() >= DROP_CHANCE) return null;

  const itemType: ItemType = (['weapon', 'armor', 'accessory'] as const)[rng.int(0, 2)]!;
  const { rarity, mult } = pickRarity(rng);
  const base = difficulty * 2;

  const scaled = (min: number, max: number): number =>
    Math.round(rng.int(min, max) * mult * (1 + difficulty * 0.15));

  let atk_bonus = 0;
  let def_bonus = 0;
  let hp_bonus = 0;

  if (itemType === 'weapon') {
    atk_bonus = scaled(base, base + 4);
  } else if (itemType === 'armor') {
    def_bonus = scaled(base, base + 3);
    hp_bonus = scaled(base * 2, base * 2 + 6);
  } else {
    atk_bonus = scaled(1, base);
    def_bonus = scaled(1, base);
  }

  return {
    item_type: itemType,
    name: ITEM_NAMES[itemType][rarity],
    rarity,
    atk_bonus,
    def_bonus,
    hp_bonus,
  };
}
