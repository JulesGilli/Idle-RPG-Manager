/**
 * Reliques : équipement du slot `relic`, craftées à partir du LOOT DE DONJON
 * (fragments de relique + sceau de catacombe). Contrairement aux bijoux (passif
 * en %), une relique donne des STATS BRUTES, avec une forte composante PV — c'est
 * la récompense d'un run de donjon complet.
 *
 * Mêmes règles que le craft d'arme/armure : stat de base FIXE modulée par la
 * rareté dans la bande −20 % (Médiocre) → +35 % (Ultime). Pur et déterministe
 * (partagé front + Edge Function) ; seule la rareté est tirée.
 */
import { rollBonuses, RARITY_MULT, type Rarity } from './loot.ts';
import { CRAFT_RARITY_WEIGHTS, type Recipe } from './forge.ts';
import type { Rng } from '../combat/prng.ts';

/** Un modèle de relique : profil de stats (biais) et puissance de base. */
export type RelicBase = {
  id: string;
  label: string;
  icon: string;
  /** Puissance de base (avant rareté et biais). */
  magnitude: number;
  bias: { atk: number; def: number; hp: number };
};

export const RELIC_BASES: RelicBase[] = [
  {
    id: 'talisman_vigueur',
    label: 'Talisman de Vigueur',
    icon: '🩸',
    magnitude: 34,
    bias: { atk: 0.8, def: 1, hp: 1.4 },
  },
  {
    id: 'idole_guerre',
    label: 'Idole de Guerre',
    icon: '⚔️',
    magnitude: 34,
    bias: { atk: 1.6, def: 0.9, hp: 1 },
  },
  {
    id: 'egide_ancestrale',
    label: 'Égide Ancestrale',
    icon: '🛡️',
    magnitude: 34,
    bias: { atk: 0.8, def: 1.5, hp: 1.1 },
  },
];

export function getRelicBase(id: string): RelicBase | undefined {
  return RELIC_BASES.find((b) => b.id === id);
}

/** Coût d'une relique : or + fragments de relique + 1 sceau de catacombe. */
export function relicRecipe(_base: RelicBase): Recipe {
  return {
    gold: 3000,
    materials: [
      { key: 'fragment_relique', qty: 5 },
      { key: 'sceau_catacombe', qty: 1 },
    ],
  };
}

export type RelicCraftResult = {
  item_type: 'relic';
  name: string;
  rarity: Rarity;
  weight: null;
  tier: number;
  atk_bonus: number;
  def_bonus: number;
  hp_bonus: number;
};

function pickRarity(rng: Rng): Rarity {
  const entries = Object.entries(CRAFT_RARITY_WEIGHTS) as [Rarity, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = rng.next() * total;
  for (const [rarity, w] of entries) {
    roll -= w;
    if (roll < 0) return rarity;
  }
  return entries[0]![0];
}

/** Construit la relique pour une rareté donnée (partagé craft réel / ranges). */
function buildRelic(base: RelicBase, rarity: Rarity): RelicCraftResult {
  const rolled = rollBonuses('relic', base.magnitude, RARITY_MULT[rarity]);
  return {
    item_type: 'relic',
    name: base.label,
    rarity,
    weight: null,
    tier: 1,
    atk_bonus: Math.round(rolled.atk_bonus * base.bias.atk),
    def_bonus: Math.round(rolled.def_bonus * base.bias.def),
    hp_bonus: Math.round(rolled.hp_bonus * base.bias.hp),
  };
}

/** Fabrique une relique du modèle `base` (rareté à % globaux, stats déterministes). */
export function craftRelic(base: RelicBase, rng: Rng): RelicCraftResult {
  return buildRelic(base, pickRarity(rng));
}

export type RelicStatRanges = {
  atk: [number, number];
  def: [number, number];
  hp: [number, number];
};

/** Range de stats (Médiocre → Ultime), pour l'aperçu avant craft. */
export function relicRanges(base: RelicBase): RelicStatRanges {
  const lo = buildRelic(base, 'poor');
  const hi = buildRelic(base, 'ultimate');
  return {
    atk: [lo.atk_bonus, hi.atk_bonus],
    def: [lo.def_bonus, hi.def_bonus],
    hp: [lo.hp_bonus, hi.hp_bonus],
  };
}
