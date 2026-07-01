/**
 * Génération de loot pure et seedée (même seed → même drop).
 * Utilisée par les Edge Functions pour attribuer l'équipement.
 */
import type { Rng } from '../combat/prng.ts';

export type ItemType = 'weapon' | 'armor' | 'jewel' | 'relic';
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
const ITEM_TYPES: ItemType[] = ['weapon', 'armor', 'jewel', 'relic'];

const RARITY_TABLE: { rarity: Rarity; weight: number; mult: number }[] = [
  { rarity: 'common', weight: 65, mult: 1 },
  { rarity: 'rare', weight: 28, mult: 1.8 },
  { rarity: 'epic', weight: 7, mult: 3 },
];

const ITEM_NAMES: Record<ItemType, Record<Rarity, string>> = {
  weapon: { common: 'Épée usée', rare: 'Lame affûtée', epic: 'Fléau runique' },
  armor: { common: 'Cuir râpé', rare: 'Cotte de mailles', epic: 'Plastron mithril' },
  jewel: { common: 'Anneau terni', rare: 'Amulette gravée', epic: 'Gemme du zénith' },
  relic: { common: 'Fétiche fêlé', rare: 'Totem ancien', epic: 'Relique oubliée' },
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
 * Tire un drop pour une difficulté donnée. Retourne null si pas de drop.
 * Chaque type d'objet répartit ses bonus différemment.
 */
export function rollLoot(difficulty: number, rng: Rng): ItemDrop | null {
  if (rng.next() >= DROP_CHANCE) return null;

  const itemType = ITEM_TYPES[rng.int(0, ITEM_TYPES.length - 1)]!;
  const { rarity, mult } = pickRarity(rng);
  const base = difficulty * 2;

  const scaled = (min: number, max: number): number =>
    Math.round(rng.int(min, max) * mult * (1 + difficulty * 0.15));

  let atk_bonus = 0;
  let def_bonus = 0;
  let hp_bonus = 0;

  switch (itemType) {
    case 'weapon':
      atk_bonus = scaled(base, base + 4);
      break;
    case 'armor':
      def_bonus = scaled(base, base + 3);
      hp_bonus = scaled(base * 2, base * 2 + 6);
      break;
    case 'jewel':
      atk_bonus = scaled(1, base);
      hp_bonus = scaled(base, base * 2);
      break;
    case 'relic':
      def_bonus = scaled(1, base);
      hp_bonus = scaled(base * 2, base * 3);
      atk_bonus = scaled(1, Math.max(1, Math.floor(base / 2)));
      break;
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
