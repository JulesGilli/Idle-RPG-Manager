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
const XP_PER_LEVEL = 100;
const XP_REWARD_PER_DIFFICULTY = 40;

export type StatKey = 'hp' | 'atk' | 'def' | 'speed';

/** Points de stats octroyés par niveau gagné. */
export const POINTS_PER_LEVEL = 3;

/** Gain de stat par point dépensé. */
export const STAT_PER_POINT: Record<StatKey, number> = { hp: 8, atk: 2, def: 2, speed: 1 };

/** Points dépensés par stat (bruts). */
export type Allocation = { hp: number; atk: number; def: number; speed: number };

const EMPTY_BONUSES: ItemBonuses = { atk: 0, def: 0, hp: 0 };
const ZERO_ALLOC: Allocation = { hp: 0, atk: 0, def: 0, speed: 0 };

/** Stats effectives = base × (1 + 5%·(niveau−1)) + équipement + points alloués. */
export function effectiveStats(
  base: BaseStats,
  level: number,
  bonuses: ItemBonuses = EMPTY_BONUSES,
  alloc: Allocation = ZERO_ALLOC,
): EffectiveStats {
  const mult = 1 + LEVEL_GROWTH * (level - 1);
  return {
    hp: Math.round(base.hp * mult) + bonuses.hp + alloc.hp * STAT_PER_POINT.hp,
    atk: Math.round(base.atk * mult) + bonuses.atk + alloc.atk * STAT_PER_POINT.atk,
    def: Math.round(base.def * mult) + bonuses.def + alloc.def * STAT_PER_POINT.def,
    speed: base.speed + alloc.speed * STAT_PER_POINT.speed,
  };
}

/** XP nécessaire pour passer de `level` à `level + 1`. */
export function xpToNextLevel(level: number): number {
  return XP_PER_LEVEL * level;
}

export type XpGainResult = {
  level: number;
  xp: number;
  levelsGained: number;
};

/** Applique un gain d'XP en enchaînant les montées de niveau. */
export function applyXpGain(level: number, xp: number, gained: number): XpGainResult {
  let newLevel = level;
  let newXp = xp + gained;
  let levelsGained = 0;

  while (newXp >= xpToNextLevel(newLevel)) {
    newXp -= xpToNextLevel(newLevel);
    newLevel += 1;
    levelsGained += 1;
  }

  return { level: newLevel, xp: newXp, levelsGained };
}

/** XP gagné pour un donjon réussi (proportionnel à la difficulté). */
export function xpRewardForDungeon(difficulty: number): number {
  return XP_REWARD_PER_DIFFICULTY * difficulty;
}

/** Puissance d'un héros (pondération alignée sur la vue leaderboard). */
export function heroPower(stats: EffectiveStats): number {
  return Math.round(stats.atk * 2 + stats.def * 2 + stats.hp * 0.5 + stats.speed);
}
