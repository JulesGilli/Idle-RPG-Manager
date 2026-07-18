import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  unlockedAchievements,
  titleUnlocked,
  achievementById,
  TOWER_HALFWAY_FLOOR,
  TOWER_SUMMIT_FLOOR,
  isPreV2Account,
  V2_LAUNCH_AT,
  type AchievementStats,
} from './achievements.ts';
import { MAX_MASTERY_LEVEL, AUTO_UNLOCK_LEVEL } from './mastery.ts';
import { TOWER_MAX_FLOOR } from './tower.ts';

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
  // Une maîtrise vaut 1 au minimum (masteryLevelInfo(0) = Nv.1), jamais 0.
  forgeLevel: 1,
  jewelLevel: 1,
  relicLevel: 1,
  towerBestFloor: 0,
  fullZone10Hero: false,
  preV2Account: false,
};

describe('catalogue des succès', () => {
  it('ids et titres uniques', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    const titles = ACHIEVEMENTS.map((a) => a.title);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

describe('titre Fondateur (comptes d’avant la V2)', () => {
  it('un compte créé AVANT la bascule décroche le titre, pas un compte créé après', () => {
    expect(isPreV2Account('2026-07-09T12:00:00+02:00')).toBe(true); // compte V1
    expect(isPreV2Account(V2_LAUNCH_AT)).toBe(false); // pile à la bascule = trop tard
    expect(isPreV2Account('2026-08-01T12:00:00+02:00')).toBe(false); // compte post-V2
    expect(isPreV2Account(null)).toBe(false);
  });

  it('le succès et son titre suivent le critère', () => {
    expect(unlockedAchievements({ ...ZERO, preV2Account: true })).toContain('founder');
    expect(unlockedAchievements(ZERO)).not.toContain('founder');
    expect(titleUnlocked('Fondateur', { ...ZERO, preV2Account: true })).toBe(true);
    expect(titleUnlocked('Fondateur', ZERO)).toBe(false); // anti-triche serveur
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

/**
 * Les trois maîtrises se jouaient sans aucune reconnaissance, et la Tour non
 * plus. Ces succès suivent les jalons qui se RESSENTENT en jeu (palier d'auto,
 * plafond de maîtrise, sommet) plutôt que des chiffres ronds arbitraires.
 */
describe('succès d’atelier', () => {
  it('« Compagnon » tombe au palier où l’auto se débloque, pas avant', () => {
    expect(unlockedAchievements({ ...ZERO, forgeLevel: AUTO_UNLOCK_LEVEL - 1 })).not.toContain('first_auto');
    expect(unlockedAchievements({ ...ZERO, forgeLevel: AUTO_UNLOCK_LEVEL })).toContain('first_auto');
    // N'IMPORTE quel atelier suffit : c'est le premier palier atteint qui compte.
    expect(unlockedAchievements({ ...ZERO, relicLevel: AUTO_UNLOCK_LEVEL })).toContain('first_auto');
  });

  it('chaque atelier a son titre au plafond, et lui seul', () => {
    const forge = unlockedAchievements({ ...ZERO, forgeLevel: MAX_MASTERY_LEVEL });
    expect(forge).toContain('forge_mastery');
    expect(forge).not.toContain('jewel_mastery');
    expect(forge).not.toContain('relic_mastery');

    expect(unlockedAchievements({ ...ZERO, jewelLevel: MAX_MASTERY_LEVEL })).toContain('jewel_mastery');
    expect(unlockedAchievements({ ...ZERO, relicLevel: MAX_MASTERY_LEVEL })).toContain('relic_mastery');
  });

  it('« Grand Artisan » exige les TROIS ateliers au plafond', () => {
    const deux = { ...ZERO, forgeLevel: MAX_MASTERY_LEVEL, jewelLevel: MAX_MASTERY_LEVEL };
    expect(unlockedAchievements(deux)).not.toContain('all_masteries');
    expect(unlockedAchievements({ ...deux, relicLevel: MAX_MASTERY_LEVEL })).toContain('all_masteries');
  });
});

describe('succès de la Tour', () => {
  it('le sommet suit le VRAI plafond de la tour', () => {
    // TOWER_SUMMIT_FLOOR duplique TOWER_MAX_FLOOR pour ne pas traîner le moteur
    // de combat dans la fonction `titles` : ce test est le prix de la copie.
    expect(TOWER_SUMMIT_FLOOR).toBe(TOWER_MAX_FLOOR);
    expect(TOWER_HALFWAY_FLOOR).toBeLessThan(TOWER_SUMMIT_FLOOR);
  });

  it('débloque à l’étage, pas avant', () => {
    expect(unlockedAchievements({ ...ZERO, towerBestFloor: TOWER_HALFWAY_FLOOR - 1 })).not.toContain('tower_halfway');
    expect(unlockedAchievements({ ...ZERO, towerBestFloor: TOWER_HALFWAY_FLOOR })).toContain('tower_halfway');
    expect(unlockedAchievements({ ...ZERO, towerBestFloor: TOWER_SUMMIT_FLOOR - 1 })).not.toContain('tower_summit');
  });

  it('le sommet implique le mi-parcours — une échelle, pas deux paliers isolés', () => {
    const top = unlockedAchievements({ ...ZERO, towerBestFloor: TOWER_SUMMIT_FLOOR });
    expect(top).toEqual(expect.arrayContaining(['tower_halfway', 'tower_summit']));
  });
});

describe('succès de panoplie', () => {
  it('exige les quatre pièces en zone 10', () => {
    expect(unlockedAchievements({ ...ZERO, fullZone10Hero: false })).not.toContain('zone10_full');
    expect(unlockedAchievements({ ...ZERO, fullZone10Hero: true })).toContain('zone10_full');
  });
});
