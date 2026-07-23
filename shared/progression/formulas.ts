/**
 * Formules de progression pures (stats effectives, XP, puissance).
 * Partagé front + Edge Function. La croissance +5%/niveau est répliquée
 * (en approximation) dans la vue SQL `leaderboard`.
 */

export type BaseStats = {
  hp: number;
  atk: number;
  def: number;
  speed: number;
};

export type ItemBonuses = {
  atk: number;
  def: number;
  hp: number;
};

export type EffectiveStats = BaseStats;

export const LEVEL_GROWTH = 0.05;

/**
 * Multiplicateur global de PV des HÉROS (rééquilibrage : combats plus longs et
 * tactiques). Les monstres reçoivent le même facteur côté moteur de combat
 * (`MONSTER_HP_SCALE`). Appliqué sur les PV effectifs → visible sur la fiche.
 */
export const HERO_HP_SCALE = 4;

/**
 * PV d'un ITEM tels qu'AFFICHÉS. Le bonus PV stocké/forgé d'un équipement est
 * BRUT ; le héros le multiplie par `HERO_HP_SCALE` (×4), comme tout PV d'équipement,
 * alors qu'ATK/DEF sont accordés 1:1. Sans cette mise à l'échelle, une carte d'item
 * annonce ¼ des PV réellement gagnés. À utiliser PARTOUT où l'on affiche les PV
 * d'un item / d'une pièce / d'un bonus de set pour que « affiché = accordé ».
 */
export function displayHp(rawHp: number): number {
  return Math.round(rawHp * HERO_HP_SCALE);
}

const XP_PER_LEVEL = 100;
/** Croissance exponentielle du coût d'un niveau (+12 % composés par niveau). */
const XP_CURVE = 1.12;
const XP_REWARD_PER_DIFFICULTY = 40;

export type StatKey = 'hp' | 'atk' | 'def' | 'speed';

/**
 * Points de compétence octroyés par niveau gagné (dépensés dans l'arbre de la
 * classe, à la Bibliothèque du Savoir). Les stats, elles, montent
 * automatiquement via la croissance +5 %/niveau (`LEVEL_GROWTH`).
 */
export const SKILL_POINTS_PER_LEVEL = 1;

/** Gain de stat par point dépensé (allocation manuelle historique, gelée). */
export const STAT_PER_POINT: Record<StatKey, number> = { hp: 8, atk: 2, def: 2, speed: 1 };

/** Points dépensés par stat (bruts). */
export type Allocation = { hp: number; atk: number; def: number; speed: number };

/** Bonus plats issus de l'arbre de compétence (par stat). */
export type SkillBonuses = { hp: number; atk: number; def: number; speed: number };

const EMPTY_BONUSES: ItemBonuses = { atk: 0, def: 0, hp: 0 };
const ZERO_ALLOC: Allocation = { hp: 0, atk: 0, def: 0, speed: 0 };
const ZERO_SKILL: SkillBonuses = { hp: 0, atk: 0, def: 0, speed: 0 };

/** Stats effectives = base × (1 + 5%·(niveau−1)) + équipement + alloc + compétences. */
export function effectiveStats(
  base: BaseStats,
  level: number,
  bonuses: ItemBonuses = EMPTY_BONUSES,
  alloc: Allocation = ZERO_ALLOC,
  skill: SkillBonuses = ZERO_SKILL,
): EffectiveStats {
  const mult = 1 + LEVEL_GROWTH * (level - 1);
  const rawHp = Math.round(base.hp * mult) + bonuses.hp + alloc.hp * STAT_PER_POINT.hp + skill.hp;
  return {
    hp: rawHp * HERO_HP_SCALE,
    atk: Math.round(base.atk * mult) + bonuses.atk + alloc.atk * STAT_PER_POINT.atk + skill.atk,
    def: Math.round(base.def * mult) + bonuses.def + alloc.def * STAT_PER_POINT.def + skill.def,
    speed: base.speed + alloc.speed * STAT_PER_POINT.speed + skill.speed,
  };
}

/** Contribution d'une SOURCE à une stat, dans la même unité que `EffectiveStats`. */
export type StatContribution = { base: number; alloc: number; gear: number };

/** Répartition des 4 stats par source (voir `statBreakdown`). */
export type StatBreakdown = Record<StatKey, StatContribution>;

/**
 * Répartition d'`effectiveStats` PAR SOURCE (base classe+niveau / points alloués /
 * équipement), terme à terme de la MÊME formule — jamais dupliquée à la main,
 * donc jamais susceptible de diverger. `base + alloc + gear === effectiveStats(...)`
 * à l'euro près (le `Math.round` du niveau est capturé dans `base`, les deux
 * autres termes sont déjà entiers).
 *
 * Les compétences n'accordent aucune stat brute aujourd'hui (`skill` toujours
 * neutre côté appelants) : pas de 4e colonne pour l'instant, à ajouter ici le
 * jour où un passif d'arbre donnera un bonus plat.
 */
export function statBreakdown(base: BaseStats, level: number, bonuses: ItemBonuses, alloc: Allocation): StatBreakdown {
  const baseLeveled = effectiveStats(base, level);
  return {
    hp: { base: baseLeveled.hp, alloc: alloc.hp * STAT_PER_POINT.hp * HERO_HP_SCALE, gear: bonuses.hp * HERO_HP_SCALE },
    atk: { base: baseLeveled.atk, alloc: alloc.atk * STAT_PER_POINT.atk, gear: bonuses.atk },
    def: { base: baseLeveled.def, alloc: alloc.def * STAT_PER_POINT.def, gear: bonuses.def },
    speed: { base: baseLeveled.speed, alloc: alloc.speed * STAT_PER_POINT.speed, gear: 0 },
  };
}

/** XP nécessaire pour passer de `level` à `level + 1` (linéaire × exponentiel). */
export function xpToNextLevel(level: number): number {
  return Math.round(XP_PER_LEVEL * level * Math.pow(XP_CURVE, level - 1));
}

export type XpGainResult = {
  level: number;
  xp: number;
  levelsGained: number;
};

/** Niveau maximum d'un héros (V2 : 40 — cf. docs/refonte-v2.md §1). */
export const MAX_LEVEL = 40;

/** Applique un gain d'XP en enchaînant les montées de niveau (plafonné à MAX_LEVEL). */
export function applyXpGain(level: number, xp: number, gained: number): XpGainResult {
  let newLevel = level;
  let newXp = xp + gained;
  let levelsGained = 0;

  while (newLevel < MAX_LEVEL && newXp >= xpToNextLevel(newLevel)) {
    newXp -= xpToNextLevel(newLevel);
    newLevel += 1;
    levelsGained += 1;
  }
  // Au niveau max, l'XP n'a plus d'utilité : barre figée à 0 (pas d'accumulation).
  if (newLevel >= MAX_LEVEL) newXp = 0;

  return { level: newLevel, xp: newXp, levelsGained };
}

/* --------------------------------------------------------- RATTRAPAGE D'XP */

/**
 * Taille de l'escouade de référence : ce sont les 5 meilleurs héros qui
 * définissent le standard de l'équipe (une escouade de combat en compte 5).
 */
export const CATCH_UP_SQUAD_SIZE = 5;
/** Multiplicateur d'XP accordé aux héros en retard sur l'escouade de référence. */
export const CATCH_UP_XP_MULT = 5;

/**
 * Niveau PLAFOND de rattrapage : le niveau du 5e héros le plus haut du joueur.
 * Sous ce niveau, un héros gagne `CATCH_UP_XP_MULT` fois plus d'XP et rattrape
 * le gros de l'équipe.
 *
 * Renvoie 0 (= pas de rattrapage) tant que le joueur a moins de 5 héros : sans
 * 5e héros il n'y a pas de standard d'équipe, et prendre le dernier héros
 * possédé donnerait un bonus permanent au plus faible d'une équipe de 3.
 */
export function catchUpCapLevel(levels: number[]): number {
  if (levels.length < CATCH_UP_SQUAD_SIZE) return 0;
  const sorted = [...levels].sort((a, b) => b - a);
  return sorted[CATCH_UP_SQUAD_SIZE - 1] ?? 0;
}

/**
 * Multiplicateur d'XP d'un héros donné. STRICTEMENT en dessous du plafond :
 * un héros pile au niveau du 5e ne touche rien — il EST le standard.
 */
export function catchUpXpMult(heroLevel: number, capLevel: number): number {
  return capLevel > 0 && heroLevel < capLevel ? CATCH_UP_XP_MULT : 1;
}

/**
 * Applique un gain d'XP en RECALCULANT le multiplicateur de rattrapage à chaque
 * niveau franchi.
 *
 * Multiplier le lot entier d'un coup laissait un héros très en retard DÉPASSER
 * le plafond sur un gros farm accumulé : 100 XP × 5 pouvaient le propulser
 * au-delà du 5e héros, voire en tête. Ici, dès qu'il atteint le niveau de
 * référence, le reste du lot est crédité au taux normal.
 *
 * `gained` est l'XP BRUTE (non multipliée).
 */
export function applyCatchUpXpGain(
  level: number,
  xp: number,
  gained: number,
  capLevel: number,
): XpGainResult {
  let curLevel = level;
  let curXp = xp;
  let remaining = Math.max(0, gained);
  let levelsGained = 0;

  while (remaining > 0 && curLevel < MAX_LEVEL) {
    const mult = catchUpXpMult(curLevel, capLevel);
    // XP BRUTE nécessaire pour finir le niveau courant à ce multiplicateur.
    const missing = xpToNextLevel(curLevel) - curXp;
    const rawNeeded = Math.ceil(missing / mult);
    if (remaining < rawNeeded) {
      curXp += remaining * mult;
      remaining = 0;
      break;
    }
    // Passage de niveau : le multiplicateur est réévalué au tour suivant, donc
    // il retombe à 1 exactement quand le héros atteint le plafond.
    remaining -= rawNeeded;
    curLevel += 1;
    curXp = 0;
    levelsGained += 1;
  }

  if (curLevel >= MAX_LEVEL) curXp = 0;
  return { level: curLevel, xp: curXp, levelsGained };
}

/** XP gagné pour un donjon réussi (proportionnel à la difficulté). */
export function xpRewardForDungeon(difficulty: number): number {
  return XP_REWARD_PER_DIFFICULTY * difficulty;
}

/** Puissance d'un héros (pondération alignée sur la vue leaderboard). */
export function heroPower(stats: EffectiveStats): number {
  return Math.round(stats.atk * 2 + stats.def * 2 + stats.hp * 0.5 + stats.speed);
}
