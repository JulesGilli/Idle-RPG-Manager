/**
 * Loot pur et seedé. L'équipement ne droppe PLUS en zone : il est uniquement
 * craftable à la forge. Ici ne restent que les raretés (échelle 5 paliers),
 * les bonus d'objets (utilisés par la forge) et les taux de MATÉRIAUX de zone.
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

/** Chance qu'un boss vaincu donne son composant rare. */
export const BOSS_MATERIAL_CHANCE = 0.6;

/**
 * Chance qu'un combat gagné donne le matériau de la zone.
 * Taux relevés depuis que le craft est la seule source d'équipement.
 */
export function materialDropChance(difficulty: number): number {
  return Math.min(0.4, 0.18 + 0.005 * difficulty);
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
