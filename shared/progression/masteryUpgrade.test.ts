import { describe, it, expect } from 'vitest';
import {
  upgradeSuccessChance,
  masterySuccessBonus,
  withMastery,
  MASTERY_SUCCESS_BONUS_MAX,
  MAX_FORGE_LEVEL,
  UPGRADE_MAX,
} from './forge.ts';
import { refineSuccessChance } from './jewelry.ts';
import { workshopOfItemType } from './sets.ts';

/**
 * La maîtrise ne servait qu'au CRAFT : un maître forgeron sortait du meilleur
 * stuff mais ratait ses renforcements aussi souvent qu'un novice. Elle bonifie
 * désormais aussi l'amélioration, dans les trois ateliers et à la même échelle.
 */
describe('bonus de maîtrise sur la réussite', () => {
  it('est nul au niveau 1 et maximal au plafond', () => {
    expect(masterySuccessBonus(1)).toBe(0);
    expect(masterySuccessBonus(MAX_FORGE_LEVEL)).toBeCloseTo(MASTERY_SUCCESS_BONUS_MAX);
  });

  it('progresse de façon monotone', () => {
    let prev = -1;
    for (let lvl = 1; lvl <= MAX_FORGE_LEVEL; lvl++) {
      const b = masterySuccessBonus(lvl);
      expect(b).toBeGreaterThanOrEqual(prev);
      prev = b;
    }
  });

  it('borne les niveaux hors plage plutôt que d’extrapoler', () => {
    expect(masterySuccessBonus(0)).toBe(masterySuccessBonus(1));
    expect(masterySuccessBonus(-10)).toBe(masterySuccessBonus(1));
    expect(masterySuccessBonus(999)).toBe(masterySuccessBonus(MAX_FORGE_LEVEL));
  });

  it('ne rend jamais la réussite certaine — même un maître peut rater', () => {
    expect(withMastery(0.95, MAX_FORGE_LEVEL)).toBeLessThan(1);
    expect(withMastery(1, MAX_FORGE_LEVEL)).toBeLessThan(1);
  });
});

describe('upgradeSuccessChance', () => {
  it('sans maîtrise, garde la valeur de base (appels legacy)', () => {
    for (let lvl = 0; lvl < UPGRADE_MAX; lvl++) {
      expect(upgradeSuccessChance(lvl), `niv.${lvl}`).toBe(Math.max(0.2, 0.95 - 0.07 * lvl));
    }
  });

  it('la maîtrise aide là où ça fait mal : au pire palier', () => {
    // +9 → +10 est le dernier et le pire : 32 % de base, 47 % pour un maître.
    expect(upgradeSuccessChance(9)).toBeCloseTo(0.32);
    expect(upgradeSuccessChance(9, MAX_FORGE_LEVEL)).toBeCloseTo(0.47);
  });

  it('le plancher de 20 % est inatteignable dans la plage réelle', () => {
    // upgrade_level va de 0 à UPGRADE_MAX-1 ; 0.95 - 0.07*9 = 0.32. Le
    // `Math.max(0.2, ...)` ne se déclenche qu'à partir du niveau 11 — donc
    // jamais. Documenté ici pour que ce ne soit pas pris pour un garde-fou actif.
    for (let lvl = 0; lvl < UPGRADE_MAX; lvl++) {
      expect(upgradeSuccessChance(lvl), `niv.${lvl}`).toBeGreaterThan(0.2);
    }
  });

  it('un novice ne gagne rien, un maître gagne le bonus plein', () => {
    for (let lvl = 0; lvl < UPGRADE_MAX; lvl++) {
      expect(upgradeSuccessChance(lvl, 1), `niv.${lvl}`).toBe(upgradeSuccessChance(lvl));
      expect(upgradeSuccessChance(lvl, MAX_FORGE_LEVEL), `niv.${lvl}`).toBeGreaterThanOrEqual(
        upgradeSuccessChance(lvl),
      );
    }
  });

  it('reste décroissante avec le niveau, même pour un maître', () => {
    let prev = 2;
    for (let lvl = 0; lvl < UPGRADE_MAX; lvl++) {
      const c = upgradeSuccessChance(lvl, MAX_FORGE_LEVEL);
      expect(c, `niv.${lvl}`).toBeLessThanOrEqual(prev);
      prev = c;
    }
  });
});

describe('refineSuccessChance', () => {
  it('sans maîtrise, garde la valeur de base', () => {
    expect(refineSuccessChance(0)).toBeCloseTo(0.9);
    expect(refineSuccessChance(9)).toBeCloseTo(0.25);
  });

  it('suit la MÊME échelle de bonus que le renforcement', () => {
    const gainRefine = refineSuccessChance(9, MAX_FORGE_LEVEL) - refineSuccessChance(9);
    const gainUpgrade = upgradeSuccessChance(9, MAX_FORGE_LEVEL) - upgradeSuccessChance(9);
    expect(gainRefine).toBeCloseTo(gainUpgrade);
  });
});

describe('quel atelier gouverne quel objet', () => {
  it('route chaque type vers son atelier', () => {
    expect(workshopOfItemType('weapon')).toBe('forge');
    expect(workshopOfItemType('armor')).toBe('forge');
    expect(workshopOfItemType('jewel')).toBe('jewelry');
    expect(workshopOfItemType('relic')).toBe('altar');
  });

  it('null sur un type inconnu — pas de bonus au hasard', () => {
    expect(workshopOfItemType('rune')).toBeNull();
    expect(workshopOfItemType('')).toBeNull();
  });
});
