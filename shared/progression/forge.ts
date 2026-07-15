/**
 * Forge : craft d'objets SPÉCIFIQUES (base × composant de zone) et amélioration.
 * - La base (Grande épée, Sceptre, Armure de plaques…) fixe le type, le poids
 *   et le profil de stats.
 * - Le composant vient d'une zone et THÉMATISE l'objet : nom ("Épée de givre"),
 *   puissance croissante avec la zone, et bonus de stats liés au thème.
 * - La rareté est tirée avec des % GLOBAUX identiques pour tous les crafts.
 * - Les zones 1-10 forment le Tier de craft 1 ; chaque palier de 10 zones
 *   futures débloquera le tier suivant (verrouillé côté serveur).
 * Pur et partagé front + Edge Function.
 */
import { rollBonuses, RARITY_MULT, RARITY_ORDER, type ItemType, type Rarity, type ItemWeight } from './loot.ts';
import type { Rng } from '../combat/prng.ts';

export const UPGRADE_MAX = 10;
const UPGRADE_STEP = 0.1;

/** Bonus effectif d'un objet à un niveau d'amélioration donné. */
export function effectiveBonus(base: number, upgradeLevel: number): number {
  return Math.round(base * (1 + UPGRADE_STEP * upgradeLevel));
}

/** Nombre de zones par tier de craft (palier). */
export const ZONES_PER_CRAFT_TIER = 10;

/** Tier de craft débloqué pour un nombre de zones terminées (boss battu). */
export function unlockedCraftTier(zonesCompleted: number): number {
  return 1 + Math.floor(zonesCompleted / ZONES_PER_CRAFT_TIER);
}

/**
 * Coût pour passer de `level` à `level+1`. Consomme le matériau de farm de la
 * ZONE de l'objet (déduit de son composant), pas un matériau fixe : un objet de
 * la zone 5 coûte de l'obsidienne, pas de l'écorce (zone 1).
 */
export type Recipe = { gold: number; materials: { key: string; qty: number }[] };
export function upgradeCost(level: number, materialKey = 'ecorce'): Recipe {
  return {
    gold: 100 * (level + 1) * (level + 1),
    materials: [{ key: materialKey, qty: 3 * (level + 1) }],
  };
}

/** Chance de réussite d'une amélioration depuis `level`. */
export function upgradeSuccessChance(level: number): number {
  return Math.max(0.2, 0.95 - 0.07 * level);
}

/* --------------------------------------------------------------- CRAFT ---- */

/**
 * % de rareté GLOBAUX (joaillerie / reliques). Pour les ARMES/ARMURES, la forge
 * utilise désormais `craftRarityWeights(niveauDeForge)` (voir maîtrise ci-dessous).
 */
export const CRAFT_RARITY_WEIGHTS: Record<Rarity, number> = {
  poor: 30,
  common: 40,
  uncommon: 18,
  advanced: 9,
  ultimate: 3,
};

/* ------------------------------------------------------------------ *
 * MAÎTRISE DE FORGE (niveau de forgeron, global par joueur)          *
 * ------------------------------------------------------------------ *
 * Alimentée par l'XP gagnée à CHAQUE craft d'arme/armure. À bas       *
 * niveau, le bon stuff est RARE ; en montant, les probabilités de     *
 * hautes raretés s'améliorent nettement. Serveur autoritaire : le     *
 * client n'affiche que l'aperçu via les mêmes fonctions pures.        */

/** Niveau de forge maximal. */
export const MAX_FORGE_LEVEL = 20;

/** XP nécessaire pour passer de `level` à `level + 1` (courbe douce). */
function forgeXpStep(level: number): number {
  return 80 + 40 * level;
}

export type ForgeLevelInfo = {
  level: number;
  xpInto: number;
  xpForNext: number;
  totalXp: number;
};

/** Dérive le niveau de forge (et la progression) à partir de l'XP totale. */
export function forgeLevelInfo(totalXp: number): ForgeLevelInfo {
  const xp = Math.max(0, Math.floor(totalXp));
  let level = 1;
  let remaining = xp;
  while (level < MAX_FORGE_LEVEL) {
    const step = forgeXpStep(level);
    if (remaining < step) return { level, xpInto: remaining, xpForNext: step, totalXp: xp };
    remaining -= step;
    level += 1;
  }
  return { level: MAX_FORGE_LEVEL, xpInto: 0, xpForNext: 0, totalXp: xp };
}

/** XP de forge gagnée par craft (plus la zone/tier du matériau est haute, plus ça rapporte). */
export function forgeMasteryXpGain(mat: ForgeMaterialTheme): number {
  return Math.round(5 + mat.zone * 2 + mat.craftTier * 3);
}

// Distribution NOVICE (bas niveau : le bon stuff est très rare) →
// distribution MAÎTRE (haut niveau : nettement meilleur). Interpolées par niveau.
const FORGE_RARITY_NOVICE: Record<Rarity, number> = {
  poor: 46,
  common: 37,
  uncommon: 12,
  advanced: 4,
  ultimate: 1,
};
const FORGE_RARITY_MASTER: Record<Rarity, number> = {
  poor: 5,
  common: 20,
  uncommon: 35,
  advanced: 28,
  ultimate: 12,
};

/**
 * Poids de rareté d'un craft d'arme/armure selon le niveau de forge (1..MAX).
 * Interpolation linéaire novice → maître.
 */
export function craftRarityWeights(forgeLevel: number): Record<Rarity, number> {
  const denom = MAX_FORGE_LEVEL - 1;
  const p = denom <= 0 ? 0 : Math.min(1, Math.max(0, (forgeLevel - 1) / denom));
  const out = {} as Record<Rarity, number>;
  for (const r of RARITY_ORDER) {
    out[r] = FORGE_RARITY_NOVICE[r] + (FORGE_RARITY_MASTER[r] - FORGE_RARITY_NOVICE[r]) * p;
  }
  return out;
}

/** Amplificateur de type porté par une arme : +pct de dégâts physiques/magiques, ou de soin. */
export type WeaponTypeBonus = { kind: 'physical' | 'magical' | 'heal'; pct: number };

/** Un modèle d'objet forgeable : fixe le type, le poids et le profil de stats. */
export type ForgeBase = {
  id: string;
  label: string;
  icon: string;
  itemType: 'weapon' | 'armor';
  weight: ItemWeight;
  /** Biais de stats propre au modèle (multiplicateurs). */
  bias: { atk: number; def: number; hp: number };
  /** Amplificateur de type (armes uniquement). Câblage combat = étape dédiée. */
  typeBonus?: WeaponTypeBonus;
};

export const FORGE_BASES: ForgeBase[] = [
  // Armes — chacune porte un amplificateur de type (physique / magique / soin).
  {
    id: 'grande_epee', // Inquisiteur
    label: 'Grande épée',
    icon: '🗡️',
    itemType: 'weapon',
    weight: 'heavy',
    // Dégât élevé + PV (fraction de l'ATK convertie en PV, cf. buildCraft).
    bias: { atk: 1.1, def: 0, hp: 0.6 },
    typeBonus: { kind: 'physical', pct: 0.1 },
  },
  {
    id: 'marteau',
    label: 'Marteau de guerre',
    icon: '🔨',
    itemType: 'weapon',
    weight: 'heavy',
    // Dégât moyen + DEF.
    bias: { atk: 0.9, def: 0.5, hp: 0 },
    typeBonus: { kind: 'magical', pct: 0.1 },
  },
  {
    id: 'epee', // Guerrier
    label: 'Épée',
    icon: '⚔️',
    itemType: 'weapon',
    weight: 'medium',
    bias: { atk: 1.1, def: 0, hp: 0 }, // dégât élevé
    typeBonus: { kind: 'physical', pct: 0.1 },
  },
  {
    id: 'faux', // Nécromancien
    label: 'Faux',
    icon: '🌾',
    itemType: 'weapon',
    weight: 'medium',
    bias: { atk: 1, def: 0, hp: 0 },
    typeBonus: { kind: 'magical', pct: 0.1 },
  },
  {
    id: 'arc', // Archer — V2 : passe en léger
    label: 'Arc',
    icon: '🏹',
    itemType: 'weapon',
    weight: 'light',
    bias: { atk: 1.1, def: 0, hp: 0 }, // dégât élevé
    typeBonus: { kind: 'physical', pct: 0.1 },
  },
  {
    id: 'dague', // Voleur
    label: 'Dague',
    icon: '🔪',
    itemType: 'weapon',
    weight: 'light',
    bias: { atk: 0.95, def: 0, hp: 0 },
    typeBonus: { kind: 'physical', pct: 0.1 },
  },
  {
    id: 'sceptre', // Mage
    label: 'Sceptre',
    icon: '🪄',
    itemType: 'weapon',
    weight: 'light',
    bias: { atk: 1.1, def: 0, hp: 0 }, // dégât élevé
    typeBonus: { kind: 'magical', pct: 0.1 },
  },
  {
    id: 'baton', // Oracle (soigneur)
    label: 'Bâton',
    icon: '🦯',
    itemType: 'weapon',
    weight: 'light',
    bias: { atk: 0.65, def: 0, hp: 0 }, // dégât faible (le bâton amplifie le soin)
    typeBonus: { kind: 'heal', pct: 0.1 },
  },
  // Armures
  {
    id: 'plaques',
    label: 'Armure de plaques',
    icon: '🛡️',
    itemType: 'armor',
    weight: 'heavy',
    bias: { atk: 1, def: 1.2, hp: 0.95 },
  },
  {
    id: 'mailles',
    label: 'Cotte de mailles',
    icon: '⛓️',
    itemType: 'armor',
    weight: 'medium',
    bias: { atk: 1, def: 1, hp: 1 },
  },
  {
    id: 'tunique',
    label: 'Tunique renforcée',
    icon: '🥋',
    itemType: 'armor',
    weight: 'light',
    bias: { atk: 1, def: 0.85, hp: 1.15 },
  },
];

/**
 * Un composant de forge, lié à une zone : fixe le coût, la puissance,
 * le nom ("de givre") et le THÈME de stats de l'objet forgé.
 */
export type ForgeMaterialTheme = {
  id: string;
  label: string;
  /** Suffixe du nom généré (invariant en genre) : "Épée de givre"… */
  suffix: string;
  /** Zone d'origine (1-based) — sert au tri et à la lisibilité. */
  zone: number;
  /** Palier de craft : zones 1-10 = tier 1, zones 11-20 = tier 2… */
  craftTier: number;
  gold: number;
  materials: { key: string; qty: number }[];
  /** Puissance de base des stats (avant rareté et biais). */
  magnitude: number;
  /** Bonus thématiques (fraction de la magnitude, ajoutés au roll). */
  theme: Partial<Record<'atk' | 'def' | 'hp', number>>;
};

export const FORGE_MATERIALS: ForgeMaterialTheme[] = [
  {
    id: 'chene',
    label: 'Chêne',
    suffix: 'en chêne',
    zone: 1,
    craftTier: 1,
    gold: 120,
    materials: [{ key: 'ecorce', qty: 10 }],
    magnitude: 6,
    theme: {},
  },
  {
    id: 'givre',
    label: 'Givre',
    suffix: 'de givre',
    zone: 2,
    craftTier: 1,
    gold: 260,
    materials: [{ key: 'cristal', qty: 10 }],
    magnitude: 9,
    theme: { def: 0.4 },
  },
  {
    id: 'sables',
    label: 'Sable noir',
    suffix: 'des sables',
    zone: 3,
    craftTier: 1,
    gold: 450,
    materials: [{ key: 'sable_noir', qty: 10 }],
    magnitude: 12,
    theme: { atk: 0.3 },
  },
  {
    id: 'marais',
    label: 'Essence des marais',
    suffix: 'des marais',
    zone: 4,
    craftTier: 1,
    gold: 700,
    materials: [
      { key: 'spore', qty: 12 },
      { key: 'coeur_hydre', qty: 1 },
    ],
    magnitude: 15,
    theme: { hp: 0.6 },
  },
  {
    id: 'obsidienne',
    label: 'Obsidienne',
    suffix: "d'obsidienne",
    zone: 5,
    craftTier: 1,
    gold: 1000,
    materials: [
      { key: 'obsidienne', qty: 12 },
      { key: 'braise_eternelle', qty: 1 },
    ],
    magnitude: 19,
    theme: { atk: 0.5 },
  },
  {
    id: 'runique',
    label: 'Rune',
    suffix: 'runique',
    zone: 6,
    craftTier: 1,
    gold: 1400,
    materials: [
      { key: 'rune', qty: 12 },
      { key: 'fragment_titan', qty: 1 },
    ],
    magnitude: 23,
    theme: { def: 0.3, hp: 0.3 },
  },
  {
    id: 'abysses',
    label: 'Nacre noire',
    suffix: 'des abysses',
    zone: 7,
    craftTier: 1,
    gold: 1900,
    materials: [
      { key: 'nacre_noire', qty: 14 },
      { key: 'encre_kraken', qty: 2 },
    ],
    magnitude: 27,
    theme: { hp: 0.8 },
  },
  {
    id: 'tempete',
    label: "Plume d'orage",
    suffix: 'de tempête',
    zone: 8,
    craftTier: 1,
    gold: 2500,
    materials: [
      { key: 'plume_orage', qty: 14 },
      { key: 'foudre_condensee', qty: 2 },
    ],
    magnitude: 32,
    theme: { atk: 0.6 },
  },
  {
    id: 'ombre',
    label: 'Ombre pure',
    suffix: "d'ombre",
    zone: 9,
    craftTier: 1,
    gold: 3200,
    materials: [
      { key: 'ombre_pure', qty: 14 },
      { key: 'coeur_ombre', qty: 2 },
    ],
    magnitude: 37,
    theme: { atk: 0.4, def: 0.2 },
  },
  {
    id: 'etoiles',
    label: "Poussière d'étoile",
    suffix: 'des étoiles',
    zone: 10,
    craftTier: 1,
    gold: 4000,
    materials: [
      { key: 'poussiere_etoile', qty: 16 },
      { key: 'essence_astrale', qty: 3 },
    ],
    magnitude: 42,
    theme: { atk: 0.4, def: 0.4, hp: 0.4 },
  },
];

/**
 * Zone (1-based) du composant d'un objet, déduite du suffixe de son nom
 * (« Épée de givre » → zone 2). 0 si inconnue. Partagé front + serveur pour
 * calculer le coût d'amélioration/raffinage dans la bonne zone.
 */
export function materialZoneOfName(name: string): number {
  const n = name.toLowerCase();
  // Suffixes du plus long au plus court pour éviter les faux positifs.
  const sorted = [...FORGE_MATERIALS].sort((a, b) => b.suffix.length - a.suffix.length);
  for (const m of sorted) if (n.includes(m.suffix.toLowerCase())) return m.zone;
  return 0;
}

/** Matériau de farm principal d'une zone (clé `player_resources`). Fallback zone 1. */
export function zoneFarmMaterial(zone: number): string {
  const m = FORGE_MATERIALS.find((x) => x.zone === zone) ?? FORGE_MATERIALS[0]!;
  return m.materials[0]!.key;
}

export function getBase(id: string): ForgeBase | undefined {
  return FORGE_BASES.find((b) => b.id === id);
}

export function getMaterialTier(id: string): ForgeMaterialTheme | undefined {
  return FORGE_MATERIALS.find((m) => m.id === id);
}

function pickRarity(weights: Record<Rarity, number>, rng: Rng): Rarity {
  const entries = Object.entries(weights) as [Rarity, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = rng.next() * total;
  for (const [rarity, w] of entries) {
    roll -= w;
    if (roll < 0) return rarity;
  }
  return entries[0]![0];
}

export type CraftResult = {
  item_type: ItemType;
  name: string;
  rarity: Rarity;
  weight: ItemWeight;
  tier: number;
  atk_bonus: number;
  def_bonus: number;
  hp_bonus: number;
};

/**
 * Construit l'objet pour une rareté donnée (partagé craft réel / ranges).
 * `tierMult` scale les stats brutes au tier de l'arc (arc/tier 1 = 1 → INCHANGÉ).
 */
function buildCraft(
  base: ForgeBase,
  mat: ForgeMaterialTheme,
  rarity: Rarity,
  tierMult = 1,
): CraftResult {
  const rolled = rollBonuses(base.itemType, mat.magnitude * 1.5, RARITY_MULT[rarity]);
  const themed = (k: 'atk' | 'def' | 'hp'): number =>
    Math.round((mat.theme[k] ?? 0) * mat.magnitude * RARITY_MULT[rarity]);
  // Stats de base AVANT thème/tier. Les ARMES ne rollent que de l'ATK ; leurs stats
  // SECONDAIRES (def/hp) dérivent du PROFIL du modèle (bias.def/bias.hp = fraction
  // de la magnitude d'ATK convertie) → grande épée = +PV, marteau = +DEF, le reste
  // = ATK pur. Armures/bijoux/reliques : inchangé (rollBonuses × bias).
  const isWeapon = base.itemType === 'weapon';
  const atk = Math.round(rolled.atk_bonus * base.bias.atk);
  const def = Math.round((isWeapon ? rolled.atk_bonus : rolled.def_bonus) * base.bias.def);
  const hp = Math.round((isWeapon ? rolled.atk_bonus : rolled.hp_bonus) * base.bias.hp);
  return {
    item_type: base.itemType,
    name: `${base.label} ${mat.suffix}`,
    rarity,
    weight: base.weight,
    tier: mat.craftTier,
    atk_bonus: Math.round((atk + themed('atk')) * tierMult),
    def_bonus: Math.round((def + themed('def')) * tierMult),
    hp_bonus: Math.round((hp + themed('hp')) * tierMult),
  };
}

/**
 * Fabrique l'objet `base` avec le composant `mat`.
 * Seule la rareté est tirée (% globaux) ; les stats sont ensuite déterministes.
 * `tierMult` scale les stats brutes au tier de l'arc (défaut 1 → arc 1 inchangé).
 */
export function craftItem(
  base: ForgeBase,
  mat: ForgeMaterialTheme,
  rng: Rng,
  tierMult = 1,
  forgeLevel?: number,
): CraftResult {
  // `forgeLevel` fourni → probas selon la maîtrise de forge ; sinon probas
  // globales legacy (préserve joaillerie/reliques et les tests existants).
  const weights = forgeLevel === undefined ? CRAFT_RARITY_WEIGHTS : craftRarityWeights(forgeLevel);
  return buildCraft(base, mat, pickRarity(weights, rng), tierMult);
}

/** Forge à une rareté IMPOSÉE (récompenses garanties : objet ultime de zone). */
export function craftItemAtRarity(
  base: ForgeBase,
  mat: ForgeMaterialTheme,
  rarity: Rarity,
): CraftResult {
  return buildCraft(base, mat, rarity);
}

export type CraftStatRanges = {
  atk: [number, number];
  def: [number, number];
  hp: [number, number];
};

/**
 * Range de stats d'un craft, de la rareté Médiocre (−20 %) à Ultime (+35 %).
 * Les stats étant déterministes par rareté, la range est exactement l'écart
 * entre le pire et le meilleur palier de rareté — affichée avant de crafter.
 */
export function craftRanges(base: ForgeBase, mat: ForgeMaterialTheme): CraftStatRanges {
  const lo = buildCraft(base, mat, 'poor');
  const hi = buildCraft(base, mat, 'ultimate');
  return {
    atk: [lo.atk_bonus, hi.atk_bonus],
    def: [lo.def_bonus, hi.def_bonus],
    hp: [lo.hp_bonus, hi.hp_bonus],
  };
}
