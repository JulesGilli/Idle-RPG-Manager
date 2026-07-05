/**
 * Reliques : équipement du slot `relic`. Recette HOMOGÈNE avec la forge — on
 * choisit un modèle (biais de stats) ET un composant de zone (comme une arme),
 * auquel s'ajoutent les matériaux de DONJON (fragments + sceau). Le composant
 * de zone fixe la PUISSANCE (magnitude × tier), la rareté module de −20 % à
 * +35 %. Forte composante PV via le biais. Pur et déterministe (partagé front
 * + Edge Function) ; seule la rareté est tirée.
 */
import { rollBonuses, RARITY_MULT, type Rarity } from './loot.ts';
import { CRAFT_RARITY_WEIGHTS, type Recipe, type ForgeMaterialTheme } from './forge.ts';
import type { Rng } from '../combat/prng.ts';

/** Un modèle de relique : profil de stats (biais). La puissance vient du composant. */
export type RelicBase = {
  id: string;
  label: string;
  icon: string;
  bias: { atk: number; def: number; hp: number };
};

export const RELIC_BASES: RelicBase[] = [
  { id: 'talisman_vigueur', label: 'Talisman de Vigueur', icon: '🩸', bias: { atk: 0.8, def: 1, hp: 1.4 } },
  { id: 'idole_guerre', label: 'Idole de Guerre', icon: '⚔️', bias: { atk: 1.6, def: 0.9, hp: 1 } },
  { id: 'egide_ancestrale', label: 'Égide Ancestrale', icon: '🛡️', bias: { atk: 0.8, def: 1.5, hp: 1.1 } },
];

/** Les reliques sont costaudes : magnitude du composant × ce facteur. */
const RELIC_MAGNITUDE_MULT = 1.6;

/** Matériaux de donjon exigés par toute relique (touche « relique »). */
export const RELIC_DUNGEON_MATERIALS: { key: string; qty: number }[] = [
  { key: 'fragment_relique', qty: 5 },
  { key: 'sceau_catacombe', qty: 1 },
];

export function getRelicBase(id: string): RelicBase | undefined {
  return RELIC_BASES.find((b) => b.id === id);
}

/** Coût d'une relique : composant de zone (or + matériaux) + matériaux de donjon. */
export function relicRecipe(mat: ForgeMaterialTheme): Recipe {
  return {
    gold: mat.gold + 800,
    materials: [...mat.materials, ...RELIC_DUNGEON_MATERIALS],
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
function buildRelic(base: RelicBase, mat: ForgeMaterialTheme, rarity: Rarity): RelicCraftResult {
  const rolled = rollBonuses('relic', mat.magnitude * RELIC_MAGNITUDE_MULT, RARITY_MULT[rarity]);
  return {
    item_type: 'relic',
    name: `${base.label} ${mat.suffix}`,
    rarity,
    weight: null,
    tier: mat.craftTier,
    atk_bonus: Math.round(rolled.atk_bonus * base.bias.atk),
    def_bonus: Math.round(rolled.def_bonus * base.bias.def),
    hp_bonus: Math.round(rolled.hp_bonus * base.bias.hp),
  };
}

/** Fabrique une relique (modèle × composant de zone ; rareté à % globaux). */
export function craftRelic(base: RelicBase, mat: ForgeMaterialTheme, rng: Rng): RelicCraftResult {
  return buildRelic(base, mat, pickRarity(rng));
}

export type RelicStatRanges = {
  atk: [number, number];
  def: [number, number];
  hp: [number, number];
};

/** Range de stats (Médiocre → Ultime), pour l'aperçu avant craft. */
export function relicRanges(base: RelicBase, mat: ForgeMaterialTheme): RelicStatRanges {
  const lo = buildRelic(base, mat, 'poor');
  const hi = buildRelic(base, mat, 'ultimate');
  return {
    atk: [lo.atk_bonus, hi.atk_bonus],
    def: [lo.def_bonus, hi.def_bonus],
    hp: [lo.hp_bonus, hi.hp_bonus],
  };
}
