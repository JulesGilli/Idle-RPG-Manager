/**
 * Loot pur et seedé. L'équipement ne droppe PLUS en zone : il est uniquement
 * craftable à la forge. Ici ne restent que les raretés (échelle 5 paliers),
 * les bonus d'objets (utilisés par la forge) et les taux de MATÉRIAUX de zone.
 */
export type ItemType = 'weapon' | 'armor' | 'jewel' | 'relic';
export type Rarity = 'poor' | 'common' | 'uncommon' | 'advanced' | 'ultimate';
export type ItemWeight = 'light' | 'medium' | 'heavy';

export const RARITY_ORDER: Rarity[] = ['poor', 'common', 'uncommon', 'advanced', 'ultimate'];

/**
 * Poids d'équipement autorisés par classe (arme & armure). Les bijoux, reliques
 * et pièces de set sont universels (poids null → aucune contrainte).
 * Source de vérité partagée front + la fonction SQL `equip_item` la reflète.
 */
export const CLASS_ALLOWED_WEIGHTS: Record<string, ItemWeight[]> = {
  paladin: ['heavy'],
  guerrier: ['heavy', 'medium'],
  archer: ['medium', 'light'],
  mage: ['light'],
  soigneur: ['light'],
};

/** Un objet de ce poids est-il équipable par cette classe ? (null = universel.) */
export function canEquipWeight(classId: string, weight: ItemWeight | null | undefined): boolean {
  if (!weight) return true;
  return (CLASS_ALLOWED_WEIGHTS[classId] ?? ['light', 'medium', 'heavy']).includes(weight);
}
/**
 * Modulateur de rareté appliqué à une stat de BASE fixe.
 * Bande volontairement resserrée : la rareté fait varier une stat de −20 %
 * (Médiocre) à +35 % (Ultime), par pas réguliers. Ce n'est plus un multiplicateur
 * de puissance qui explose ; c'est un simple bonus/malus de qualité.
 */
export const RARITY_MULT: Record<Rarity, number> = {
  poor: 0.8, // −20 %
  common: 0.9375, // −6.25 %
  uncommon: 1.075, // +7.5 %
  advanced: 1.2125, // +21.25 %
  ultimate: 1.35, // +35 %
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

/**
 * Bonus d'un objet selon son type et une "magnitude" de puissance.
 * La stat est FIXE (déterministe) pour une magnitude donnée ; la seule variation
 * vient du modulateur de rareté `mult` (voir RARITY_MULT). Plus de tirage
 * aléatoire intra-rareté : deux objets de même base + composant + rareté sont
 * identiques.
 */
export function rollBonuses(
  itemType: ItemType,
  magnitude: number,
  mult: number,
): { atk_bonus: number; def_bonus: number; hp_bonus: number } {
  const base = Math.max(1, Math.round(magnitude));
  const scaled = (v: number): number => Math.round(v * mult);

  switch (itemType) {
    case 'weapon':
      return { atk_bonus: scaled(base), def_bonus: 0, hp_bonus: 0 };
    case 'armor':
      return { atk_bonus: 0, def_bonus: scaled(base), hp_bonus: scaled(base * 2) };
    case 'jewel':
      return { atk_bonus: scaled(Math.max(1, Math.round(base / 2))), def_bonus: 0, hp_bonus: scaled(base) };
    case 'relic':
      return {
        atk_bonus: scaled(Math.max(1, Math.floor(base / 2))),
        def_bonus: scaled(base),
        hp_bonus: scaled(base * 2),
      };
  }
}
