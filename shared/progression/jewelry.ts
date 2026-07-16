/**
 * Joaillerie : craft de bijoux = composant de zone (PUISSANCE du %) + gemme de
 * boss (TYPE de passif). Un bijou ne donne aucune stat brute — uniquement un
 * passif en % (vampirisme, épines, esquive…). Les gemmes ne droppent que sur
 * les boss de zone. On peut librement combiner (matériaux zone 5 + gemme
 * zone 3 = puissance de la zone 5, passif de la gemme de la zone 3).
 * Pur et partagé front + Edge Function.
 */
import type { Rng } from '../combat/prng.ts';
import type { PassiveType } from '../combat/types.ts';
import { RARITY_ORDER, type Rarity } from './loot.ts';
import {
  CRAFT_RARITY_WEIGHTS,
  AUTO_FORGE_UNLOCK_LEVEL,
  withMastery,
  type ForgeMaterialTheme,
  type Recipe,
} from './forge.ts';

/** Chance qu'un boss vaincu lâche sa gemme (rare). */
export const GEM_DROP_CHANCE = 0.02;

/** Niveau maximum de raffinement d'un bijou. */
export const REFINE_MAX = 5;

/* ------------------------------------------------------------------ *
 * MAÎTRISE DE JOAILLERIE (niveau de joaillier, global par joueur)     *
 * ------------------------------------------------------------------ *
 * Pendant de la maîtrise de forge : alimentée par l'XP gagnée à       *
 * CHAQUE sertissage. À bas niveau les hautes raretés sont rares ; en  *
 * montant, elles deviennent nettement plus fréquentes — et comme la   *
 * rareté multiplie le passif (RARITY_PCT_MULT), un joaillier          *
 * expérimenté sort des bijoux plus PUISSANTS.                         */

/** Niveau de joaillerie maximal. */
export const MAX_JEWEL_LEVEL = 20;

/**
 * Palier de déblocage de l'AUTO-sertissage. Même logique et même palier que la
 * forge (cf. `AUTO_FORGE_UNLOCK_LEVEL`) : le rituel est l'expérience du début,
 * l'auto est la récompense de la maîtrise — pas un raccourci.
 */
export const AUTO_JEWEL_UNLOCK_LEVEL = AUTO_FORGE_UNLOCK_LEVEL;

/** L'auto-sertissage est-il débloqué à ce niveau de joaillerie ? */
export function autoJewelUnlocked(jewelLevel: number): boolean {
  return jewelLevel >= AUTO_JEWEL_UNLOCK_LEVEL;
}

/** XP nécessaire pour passer de `level` à `level + 1` (courbe douce). */
function jewelXpStep(level: number): number {
  return 80 + 40 * level;
}

export type JewelLevelInfo = {
  level: number;
  xpInto: number;
  xpForNext: number;
  totalXp: number;
};

/** Dérive le niveau de joaillerie (et la progression) à partir de l'XP totale. */
export function jewelLevelInfo(totalXp: number): JewelLevelInfo {
  const xp = Math.max(0, Math.floor(totalXp));
  let level = 1;
  let remaining = xp;
  while (level < MAX_JEWEL_LEVEL) {
    const step = jewelXpStep(level);
    if (remaining < step) return { level, xpInto: remaining, xpForNext: step, totalXp: xp };
    remaining -= step;
    level += 1;
  }
  return { level: MAX_JEWEL_LEVEL, xpInto: 0, xpForNext: 0, totalXp: xp };
}

/** XP de joaillerie gagnée par sertissage (plus la zone/tier est haute, plus ça rapporte). */
export function jewelMasteryXpGain(mat: ForgeMaterialTheme): number {
  return Math.round(5 + mat.zone * 2 + mat.craftTier * 3);
}

// Novice (le bon passif est rare) → maître (nettement meilleur).
const JEWEL_RARITY_NOVICE: Record<Rarity, number> = {
  poor: 46,
  common: 37,
  uncommon: 12,
  advanced: 4,
  ultimate: 1,
};
const JEWEL_RARITY_MASTER: Record<Rarity, number> = {
  poor: 5,
  common: 20,
  uncommon: 35,
  advanced: 28,
  ultimate: 12,
};

/** Poids de rareté d'un sertissage selon le niveau de joaillerie (1..MAX). */
export function jewelRarityWeights(jewelLevel: number): Record<Rarity, number> {
  const denom = MAX_JEWEL_LEVEL - 1;
  const p = denom <= 0 ? 0 : Math.min(1, Math.max(0, (jewelLevel - 1) / denom));
  const out = {} as Record<Rarity, number>;
  for (const r of RARITY_ORDER) {
    out[r] = JEWEL_RARITY_NOVICE[r] + (JEWEL_RARITY_MASTER[r] - JEWEL_RARITY_NOVICE[r]) * p;
  }
  return out;
}

export type GemDef = {
  /** Sert aussi de clé `player_resources`. */
  id: string;
  label: string;
  icon: string;
  /** Zone dont le boss droppe cette gemme. */
  mapId: string;
  zone: number;
  passive: PassiveType;
  passiveLabel: string;
  /** Épithète du nom du bijou : "Amulette d'obsidienne du Vampire". */
  epithet: string;
  /** Description avec `{X}` remplacé par la valeur. */
  description: string;
  /** % de base (zone 1, rareté commune). */
  basePct: number;
  /** Plafond dur du %. */
  maxPct: number;
};

export const GEMS: GemDef[] = [
  {
    id: 'gemme_seve',
    label: 'Gemme de Sève',
    icon: '🟢',
    mapId: 'forest',
    zone: 1,
    passive: 'regen',
    passiveLabel: 'Régénération',
    epithet: 'de Sève',
    description: 'Récupère {X}% des PV max à chaque tour',
    basePct: 2,
    maxPct: 8,
  },
  {
    id: 'gemme_glace',
    label: 'Gemme de Glace',
    icon: '🔷',
    mapId: 'caverns',
    zone: 2,
    passive: 'shield',
    passiveLabel: 'Égide',
    epithet: "d'Égide",
    description: 'Réduit les dégâts subis de {X}%',
    basePct: 4,
    maxPct: 25,
  },
  {
    id: 'gemme_solaire',
    label: 'Gemme Solaire',
    icon: '🟡',
    mapId: 'desert',
    zone: 3,
    passive: 'crit',
    passiveLabel: 'Critique',
    epithet: 'de Précision',
    description: "{X}% de chance d'infliger un coup critique (dégâts ×2)",
    basePct: 6,
    maxPct: 35,
  },
  {
    id: 'gemme_venin',
    label: 'Gemme de Venin',
    icon: '🧪',
    mapId: 'swamp',
    zone: 4,
    passive: 'venom',
    passiveLabel: 'Venin',
    epithet: 'du Serpent',
    description: '+{X}% de dégâts contre les ennemis déjà blessés',
    basePct: 8,
    maxPct: 45,
  },
  {
    id: 'gemme_braise',
    label: 'Gemme de Braise',
    icon: '🔴',
    mapId: 'volcano',
    zone: 5,
    passive: 'rage',
    passiveLabel: 'Fureur',
    epithet: 'de Fureur',
    description: '+{X}% de dégâts sous 50% de PV',
    basePct: 10,
    maxPct: 60,
  },
  {
    id: 'gemme_runique',
    label: 'Gemme Runique',
    icon: '🟣',
    mapId: 'ruins',
    zone: 6,
    passive: 'thorns',
    passiveLabel: 'Épines',
    epithet: 'des Épines',
    description: 'Renvoie {X}% des dégâts subis',
    basePct: 8,
    maxPct: 45,
  },
  {
    id: 'gemme_abyssale',
    label: 'Gemme Abyssale',
    icon: '🔵',
    mapId: 'abyss',
    zone: 7,
    passive: 'lifesteal',
    passiveLabel: 'Vampirisme',
    epithet: 'du Vampire',
    description: 'Soigne {X}% des dégâts infligés',
    basePct: 6,
    maxPct: 35,
  },
  {
    id: 'gemme_orage',
    label: "Gemme d'Orage",
    icon: '⚡',
    mapId: 'sky',
    zone: 8,
    passive: 'first_strike',
    passiveLabel: 'Foudre',
    epithet: 'de Foudre',
    description: '+{X}% de dégâts au premier tour de combat',
    basePct: 12,
    maxPct: 70,
  },
  {
    id: 'gemme_ombre',
    label: "Gemme d'Ombre",
    icon: '⚫',
    mapId: 'shadow',
    zone: 9,
    passive: 'dodge',
    passiveLabel: 'Esquive',
    epithet: 'du Spectre',
    description: "{X}% de chance d'esquiver une attaque",
    basePct: 5,
    maxPct: 30,
  },
  {
    id: 'gemme_astrale',
    label: 'Gemme Astrale',
    icon: '💠',
    mapId: 'celestial',
    zone: 10,
    passive: 'execute',
    passiveLabel: 'Exécution',
    epithet: 'du Bourreau',
    description: '+{X}% de dégâts contre les cibles sous 30% de PV',
    basePct: 12,
    maxPct: 70,
  },
];

export function getGem(id: string): GemDef | undefined {
  return GEMS.find((g) => g.id === id);
}

export function gemByMap(mapId: string): GemDef | undefined {
  return GEMS.find((g) => g.mapId === mapId);
}

/** Chaque passif correspond à une gemme unique. */
export function gemByPassive(passive: string): GemDef | undefined {
  return GEMS.find((g) => g.passive === passive);
}

/** Méta d'affichage par type de passif (pour l'inventaire / la forge). */
export const PASSIVE_META: Record<PassiveType, { label: string; icon: string }> = {
  regen: { label: 'Régénération', icon: '🌿' },
  shield: { label: 'Égide', icon: '🛡️' },
  crit: { label: 'Critique', icon: '⚡' },
  venom: { label: 'Venin', icon: '🐍' },
  rage: { label: 'Fureur', icon: '🔥' },
  thorns: { label: 'Épines', icon: '🌵' },
  lifesteal: { label: 'Vampirisme', icon: '🩸' },
  first_strike: { label: 'Foudre', icon: '🌩️' },
  dodge: { label: 'Esquive', icon: '💨' },
  execute: { label: 'Exécution', icon: '⚔️' },
};

/** La puissance du % vient du composant (zone), pas de la gemme. */
function materialPowerMult(mat: ForgeMaterialTheme): number {
  return 1 + (mat.zone - 1) * 0.22;
}

/** La rareté module doucement le % (bien moins fort que les stats brutes). */
const RARITY_PCT_MULT: Record<Rarity, number> = {
  poor: 0.8,
  common: 1,
  uncommon: 1.15,
  advanced: 1.35,
  ultimate: 1.6,
};

/** Valeur du passif (en % entiers) pour un composant × gemme × rareté. */
export function jewelPct(mat: ForgeMaterialTheme, gem: GemDef, rarity: Rarity): number {
  const raw = gem.basePct * materialPowerMult(mat) * RARITY_PCT_MULT[rarity];
  return Math.min(gem.maxPct, Math.max(1, Math.round(raw)));
}

/** Range de % possible (pire Médiocre → meilleur Ultime), pour l'affichage. */
export function jewelPctRange(mat: ForgeMaterialTheme, gem: GemDef): [number, number] {
  return [jewelPct(mat, gem, 'poor'), jewelPct(mat, gem, 'ultimate')];
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

export type JewelCraftResult = {
  item_type: 'jewel';
  name: string;
  rarity: Rarity;
  weight: null;
  tier: number;
  passive_type: PassiveType;
  passive_value: number; // % entier
};

/** Coût d'un bijou : l'or et les matériaux du composant + 1 gemme. */
export function jewelRecipe(
  mat: ForgeMaterialTheme,
  gem: GemDef,
): { gold: number; materials: { key: string; qty: number }[] } {
  return {
    gold: mat.gold,
    materials: [...mat.materials, { key: gem.id, qty: 1 }],
  };
}

/** Construit le bijou pour une rareté donnée (partagé craft réel / rareté imposée). */
function buildJewel(mat: ForgeMaterialTheme, gem: GemDef, rarity: Rarity): JewelCraftResult {
  return {
    item_type: 'jewel',
    name: `Amulette ${mat.suffix} ${gem.epithet}`,
    rarity,
    weight: null,
    tier: mat.craftTier,
    passive_type: gem.passive,
    passive_value: jewelPct(mat, gem, rarity),
  };
}

/**
 * Fabrique un bijou : nom "Amulette <composant> <gemme>", passif en %.
 * `jewelLevel` fourni → probas selon la maîtrise de joaillerie ; sinon probas
 * globales legacy (préserve les tests et les appels historiques).
 */
export function craftJewel(
  mat: ForgeMaterialTheme,
  gem: GemDef,
  rng: Rng,
  jewelLevel?: number,
): JewelCraftResult {
  const weights = jewelLevel === undefined ? CRAFT_RARITY_WEIGHTS : jewelRarityWeights(jewelLevel);
  return buildJewel(mat, gem, pickRarity(rng, weights));
}

/** Fabrique un bijou à une rareté IMPOSÉE (récompenses garanties / don admin). */
export function craftJewelAtRarity(
  mat: ForgeMaterialTheme,
  gem: GemDef,
  rarity: Rarity,
): JewelCraftResult {
  return buildJewel(mat, gem, rarity);
}

/* ---------------------------------------------------------- RAFFINEMENT -- */

/** % effectif d'un bijou raffiné : +10 % relatifs (min +1) par niveau, plafonné. */
export function refinedJewelPct(basePct: number, refineLevel: number, gem: GemDef): number {
  let value = basePct;
  for (let l = 0; l < refineLevel; l++) {
    value = Math.max(value + 1, Math.round(value * 1.1));
  }
  return Math.min(gem.maxPct, value);
}

/**
 * Coût d'un raffinement depuis `level` : or + matériau de farm de la ZONE du
 * bijou (comme l'amélioration d'un équipement) + 1 GEMME de boss du même type
 * que le passif du bijou (sink pour les gemmes, rares : drop 2 % sur les boss).
 * `materialKey` = matériau de la zone du composant ; `gemId` = gemme du passif
 * (omis → pas de gemme, pour les tests/anciens appels).
 */
export function refineCost(level: number, materialKey = 'ecorce', gemId?: string): Recipe {
  const materials = [{ key: materialKey, qty: 2 * (level + 1) }];
  if (gemId) materials.push({ key: gemId, qty: 1 });
  return {
    gold: 150 * (level + 1) * (level + 1),
    materials,
  };
}

/** Chance de réussite d'un raffinement depuis `level`. */
/**
 * Chance de réussite d'un raffinement depuis `level`.
 * `masteryLevel` fourni → bonifiée par la maîtrise de joaillerie, comme le
 * renforcement l'est par celle de forge ; sinon valeur de base.
 */
export function refineSuccessChance(level: number, masteryLevel?: number): number {
  return withMastery(Math.max(0.25, 0.9 - 0.12 * level), masteryLevel);
}
