/**
 * Reliques : équipement du slot `relic`. Recette HOMOGÈNE avec la forge — on
 * choisit un modèle (biais de stats) ET un composant de zone (comme une arme),
 * auquel s'ajoutent les matériaux de DONJON (fragments + sceau). Le composant
 * de zone fixe la PUISSANCE (magnitude × tier), la rareté module de −20 % à
 * +35 %. Forte composante PV via le biais. Pur et déterministe (partagé front
 * + Edge Function) ; seule la rareté est tirée.
 */
import { RARITY_MULT, type Rarity } from './loot.ts';
import { CRAFT_RARITY_WEIGHTS, type Recipe, type ForgeMaterialTheme } from './forge.ts';
import type { Rng } from '../combat/prng.ts';

/** Stat dominante d'un modèle de relique. */
export type RelicStat = 'atk' | 'def' | 'hp';

/**
 * Un modèle de relique : objet FOCALISÉ sur une seule stat (à la façon d'une arme
 * qui ne donne que de l'ATK). La puissance vient du composant de zone.
 */
export type RelicBase = {
  id: string;
  label: string;
  icon: string;
  primary: RelicStat;
};

export const RELIC_BASES: RelicBase[] = [
  { id: 'talisman_vigueur', label: 'Talisman de Vigueur', icon: '🩸', primary: 'hp' },
  { id: 'idole_guerre', label: 'Idole de Guerre', icon: '⚔️', primary: 'atk' },
  { id: 'egide_ancestrale', label: 'Égide Ancestrale', icon: '🛡️', primary: 'def' },
];

/**
 * Prime de puissance d'une relique par rapport à une arme/armure de même composant.
 * Modérée : la relique est un peu au-dessus (elle coûte des matériaux de donjon),
 * mais reste alignée sur une bonne arme — plus le cumul ATK+DEF+PV d'avant.
 */
const RELIC_MAGNITUDE_MULT = 1.35;

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
  const magnitude = Math.max(1, Math.round(mat.magnitude * RELIC_MAGNITUDE_MULT));
  const mult = RARITY_MULT[rarity];
  // Objet focalisé : toute la puissance va dans la stat dominante du modèle.
  // Les PV sont sur une échelle ~2× (comme armures/bijoux) pour rester comparables.
  const primaryValue = Math.round(magnitude * mult);
  const hpValue = Math.round(magnitude * 2 * mult);
  return {
    item_type: 'relic',
    name: `${base.label} ${mat.suffix}`,
    rarity,
    weight: null,
    tier: mat.craftTier,
    atk_bonus: base.primary === 'atk' ? primaryValue : 0,
    def_bonus: base.primary === 'def' ? primaryValue : 0,
    hp_bonus: base.primary === 'hp' ? hpValue : 0,
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
