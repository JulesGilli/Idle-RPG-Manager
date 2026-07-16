/**
 * Reliques : équipement du slot `relic`. Recette HOMOGÈNE avec la forge — on
 * choisit un modèle (biais de stats) ET un composant de zone (comme une arme),
 * auquel s'ajoutent les matériaux de DONJON (fragments + sceau). Le composant
 * de zone fixe la PUISSANCE (magnitude × tier), la rareté module de −20 % à
 * +35 %. Forte composante PV via le biais. Pur et déterministe (partagé front
 * + Edge Function) ; seule la rareté est tirée.
 */
import { RARITY_MULT, RARITY_ORDER, type Rarity } from './loot.ts';
import {
  CRAFT_RARITY_WEIGHTS,
  AUTO_FORGE_UNLOCK_LEVEL,
  secondaryStatPct,
  type Recipe,
  type ForgeMaterialTheme,
} from './forge.ts';
import type { Rng } from '../combat/prng.ts';

/** Stat dominante d'un modèle de relique. */
export type RelicStat = 'atk' | 'def' | 'hp';

/** Libellé court d'une stat de relique. */
export const RELIC_STAT_LABEL: Record<RelicStat, string> = { atk: 'ATK', def: 'DEF', hp: 'PV' };

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

/**
 * Fragments de relique exigés — croissent avec la PUISSANCE de la relique (donc
 * avec la zone du composant). Plus la relique visée est forte, plus il faut de
 * fragments : un incitatif direct à farmer des donjons de plus en plus durs, qui
 * lâchent davantage de fragments. Barème : 5 au départ (zone 1), +2 par zone.
 */
export function relicFragmentQty(mat: ForgeMaterialTheme): number {
  const zoneIndex = (mat.craftTier - 1) * 10 + mat.zone;
  return 3 + zoneIndex * 2;
}

/** Sceau de donjon exigé — 1 par tier de craft (échelle plus douce). */
export function relicSealQty(mat: ForgeMaterialTheme): number {
  return mat.craftTier;
}

/** Matériaux de donjon exigés par une relique donnée (touche « relique »). */
export function relicDungeonMaterials(mat: ForgeMaterialTheme): { key: string; qty: number }[] {
  return [
    { key: 'fragment_relique', qty: relicFragmentQty(mat) },
    { key: 'sceau_catacombe', qty: relicSealQty(mat) },
  ];
}

export function getRelicBase(id: string): RelicBase | undefined {
  return RELIC_BASES.find((b) => b.id === id);
}

/** Coût d'une relique : composant de zone (or + matériaux) + matériaux de donjon. */
export function relicRecipe(mat: ForgeMaterialTheme): Recipe {
  return {
    gold: mat.gold + 800,
    materials: [...mat.materials, ...relicDungeonMaterials(mat)],
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

/* ------------------------------------------------------------------ *
 * MAÎTRISE DE RELIQUAIRE (niveau de reliquaire, global par joueur)    *
 * ------------------------------------------------------------------ *
 * Troisième atelier de craft à en recevoir une, après la Forge et la  *
 * Joaillerie — les trois suivent désormais la MÊME logique : l'XP     *
 * tombe à chaque craft, le niveau améliore les probas de rareté, et   *
 * le serveur reste autoritaire (le client n'affiche l'aperçu qu'en    *
 * réutilisant ces mêmes fonctions pures).                             */

/** Niveau de reliquaire maximal. */
export const MAX_RELIC_LEVEL = 20;

/**
 * Palier de déblocage de l'AUTO-façonnage. Même palier que la forge et la
 * joaillerie (cf. `AUTO_FORGE_UNLOCK_LEVEL`) : le rituel est l'expérience du
 * début, l'auto est la récompense de la maîtrise — pas un raccourci.
 */
export const AUTO_RELIC_UNLOCK_LEVEL = AUTO_FORGE_UNLOCK_LEVEL;

/** L'auto-façonnage est-il débloqué à ce niveau de reliquaire ? */
export function autoRelicUnlocked(relicLevel: number): boolean {
  return relicLevel >= AUTO_RELIC_UNLOCK_LEVEL;
}

/** XP nécessaire pour passer de `level` à `level + 1` (même courbe que forge/joaillerie). */
function relicXpStep(level: number): number {
  return 80 + 40 * level;
}

export type RelicLevelInfo = {
  level: number;
  xpInto: number;
  xpForNext: number;
  totalXp: number;
};

/** Dérive le niveau de reliquaire (et la progression) à partir de l'XP totale. */
export function relicLevelInfo(totalXp: number): RelicLevelInfo {
  const xp = Math.max(0, Math.floor(totalXp));
  let level = 1;
  let remaining = xp;
  while (level < MAX_RELIC_LEVEL) {
    const step = relicXpStep(level);
    if (remaining < step) return { level, xpInto: remaining, xpForNext: step, totalXp: xp };
    remaining -= step;
    level += 1;
  }
  return { level: MAX_RELIC_LEVEL, xpInto: 0, xpForNext: 0, totalXp: xp };
}

/** XP de reliquaire gagnée par relique forgée (plus la zone/tier est haute, plus ça rapporte). */
export function relicMasteryXpGain(mat: ForgeMaterialTheme): number {
  return Math.round(5 + mat.zone * 2 + mat.craftTier * 3);
}

// Novice (la bonne relique est rare) → maître (nettement meilleur).
const RELIC_RARITY_NOVICE: Record<Rarity, number> = {
  poor: 46,
  common: 37,
  uncommon: 12,
  advanced: 4,
  ultimate: 1,
};
const RELIC_RARITY_MASTER: Record<Rarity, number> = {
  poor: 5,
  common: 20,
  uncommon: 35,
  advanced: 28,
  ultimate: 12,
};

/** Poids de rareté d'une relique selon le niveau de reliquaire (1..MAX). */
export function relicRarityWeights(relicLevel: number): Record<Rarity, number> {
  const denom = MAX_RELIC_LEVEL - 1;
  const p = denom <= 0 ? 0 : Math.min(1, Math.max(0, (relicLevel - 1) / denom));
  const out = {} as Record<Rarity, number>;
  for (const r of RARITY_ORDER) {
    out[r] = RELIC_RARITY_NOVICE[r] + (RELIC_RARITY_MASTER[r] - RELIC_RARITY_NOVICE[r]) * p;
  }
  return out;
}

function pickRarity(rng: Rng, weights: Record<Rarity, number>): Rarity {
  const entries = Object.entries(weights) as [Rarity, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = rng.next() * total;
  for (const [rarity, w] of entries) {
    roll -= w;
    if (roll < 0) return rarity;
  }
  return entries[0]![0];
}

/**
 * Construit la relique pour une rareté donnée (partagé craft réel / ranges).
 *
 * Une relique donne les TROIS stats :
 *  · la stat PRIORITAIRE du modèle est portée par le matériau de base (sa
 *    magnitude) et touche 100 % de la puissance ;
 *  · les deux AUTRES sont alimentées par les matériaux de BOSS, d'où une part
 *    qui suit la zone (10 % → 35 %, cf. `secondaryStatPct`).
 * Les PV restent sur une échelle ~2× (comme armures/bijoux) : chaque stat est
 * donc calculée à sa pleine valeur « si elle était primaire », puis pondérée.
 */
function buildRelic(base: RelicBase, mat: ForgeMaterialTheme, rarity: Rarity): RelicCraftResult {
  const magnitude = Math.max(1, Math.round(mat.magnitude * RELIC_MAGNITUDE_MULT));
  const mult = RARITY_MULT[rarity];
  const secondary = secondaryStatPct(mat);
  /** Valeur pleine d'une stat si elle était la prioritaire du modèle. */
  const full = (stat: RelicStat): number => Math.round(magnitude * (stat === 'hp' ? 2 : 1) * mult);
  /** Pleine pour la prioritaire, pondérée pour les deux autres. */
  const value = (stat: RelicStat): number =>
    stat === base.primary ? full(stat) : Math.round(full(stat) * secondary);
  return {
    item_type: 'relic',
    name: `${base.label} ${mat.suffix}`,
    rarity,
    weight: null,
    tier: mat.craftTier,
    atk_bonus: value('atk'),
    def_bonus: value('def'),
    hp_bonus: value('hp'),
  };
}

/**
 * Fabrique une relique (modèle × composant de zone).
 * `relicLevel` fourni → probas selon la maîtrise de reliquaire ; sinon probas
 * globales legacy (préserve les reliques offertes et les tests existants).
 */
export function craftRelic(
  base: RelicBase,
  mat: ForgeMaterialTheme,
  rng: Rng,
  relicLevel?: number,
): RelicCraftResult {
  const weights = relicLevel === undefined ? CRAFT_RARITY_WEIGHTS : relicRarityWeights(relicLevel);
  return buildRelic(base, mat, pickRarity(rng, weights));
}

/** Fabrique une relique à une rareté IMPOSÉE (récompenses garanties : reliques offertes). */
export function craftRelicAtRarity(
  base: RelicBase,
  mat: ForgeMaterialTheme,
  rarity: Rarity,
): RelicCraftResult {
  return buildRelic(base, mat, rarity);
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
