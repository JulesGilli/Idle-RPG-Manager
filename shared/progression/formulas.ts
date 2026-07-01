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

const EMPTY_BONUSES: ItemBonuses = { atk: 0, def: 0, hp: 0 };

/** Stats effectives = base × (1 + 5%·(niveau−1)) + bonus d'équipement. */
export function effectiveStats(
  base: BaseStats,
  level: number,
  bonuses: ItemBonuses = EMPTY_BONUSES,
): EffectiveStats {
  const mult = 1 + LEVEL_GROWTH * (level - 1);
  return {
    hp: Math.round(base.hp * mult) + bonuses.hp,
    atk: Math.round(base.atk * mult) + bonuses.atk,
    def: Math.round(base.def * mult) + bonuses.def,
    speed: base.speed,
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
