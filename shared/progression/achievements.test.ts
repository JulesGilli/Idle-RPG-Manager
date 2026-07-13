import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  unlockedAchievements,
  titleUnlocked,
  achievementById,
  type AchievementStats,
} from './achievements.ts';

const ZERO: AchievementStats = {
  heroesCount: 0,
  maxHeroLevel: 1,
  hasSGrade: false,
  distinctClasses: 0,
  dungeonsCleared: 0,
  arenaRank: null,
  blessedWeapons: 0,
  maxUpgrade: 0,
  itemsCount: 0,
  pantinBest: 0,
  maxDifficulty: 0,
};

describe('catalogue des succès', () => {
  it('ids et titres uniques', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    const titles = ACHIEVEMENTS.map((a) => a.title);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

describe('unlockedAchievements', () => {
  it('aucun succès sur un compte vierge (sauf ceux à seuil 0 — ici aucun)', () => {
    expect(unlockedAchievements(ZERO)).toEqual([]);
  });

  it('débloque au fil des seuils', () => {
    expect(unlockedAchievements({ ...ZERO, heroesCount: 1 })).toContain('first_hero');
    expect(unlockedAchievements({ ...ZERO, heroesCount: 9 })).toEqual(
      expect.arrayContaining(['first_hero', 'full_roster']),
    );
    expect(unlockedAchievements({ ...ZERO, hasSGrade: true })).toContain('s_grade');
    expect(unlockedAchievements({ ...ZERO, distinctClasses: 8 })).toContain('all_classes');
    expect(unlockedAchievements({ ...ZERO, maxHeroLevel: 40 })).toContain('max_level');
    expect(unlockedAchievements({ ...ZERO, dungeonsCleared: 4 })).toContain('all_dungeons');
    expect(unlockedAchievements({ ...ZERO, arenaRank: 1 })).toContain('arena_top');
    expect(unlockedAchievements({ ...ZERO, blessedWeapons: 1 })).toContain('blessed');
    expect(unlockedAchievements({ ...ZERO, maxUpgrade: 10 })).toContain('forge_master');
    expect(unlockedAchievements({ ...ZERO, itemsCount: 50 })).toContain('collector');
    expect(unlockedAchievements({ ...ZERO, pantinBest: 1_000_000 })).toContain('pantin_crusher');
    expect(unlockedAchievements({ ...ZERO, maxDifficulty: 30 })).toContain('conqueror');
  });

  it('sous le seuil → verrouillé', () => {
    expect(unlockedAchievements({ ...ZERO, arenaRank: 2 })).not.toContain('arena_top');
    expect(unlockedAchievements({ ...ZERO, maxUpgrade: 9 })).not.toContain('forge_master');
  });
});

describe('titleUnlocked (validation serveur)', () => {
  it('vrai seulement si le succès qui donne ce titre est rempli', () => {
    expect(titleUnlocked('Vétéran', { ...ZERO, maxHeroLevel: 40 })).toBe(true);
    expect(titleUnlocked('Vétéran', ZERO)).toBe(false);
    expect(titleUnlocked('Titre inexistant', { ...ZERO, maxHeroLevel: 40 })).toBe(false);
  });
});

describe('achievementById', () => {
  it('retrouve un succès', () => {
    expect(achievementById('max_level')?.title).toBe('Vétéran');
    expect(achievementById('inconnu')).toBeUndefined();
  });
});
