import { describe, expect, it } from 'vitest';
import {
  catchUpCapLevel,
  catchUpXpMult,
  applyCatchUpXpGain,
  applyXpGain,
  CATCH_UP_XP_MULT,
  MAX_LEVEL,
  xpToNextLevel,
} from './formulas.ts';

describe('Rattrapage d\'XP — plafond', () => {
  it('prend le niveau du 5e heros le plus haut', () => {
    expect(catchUpCapLevel([30, 28, 25, 22, 20, 12, 5])).toBe(20);
  });

  it("ne depend pas de l'ordre d'entree", () => {
    expect(catchUpCapLevel([5, 20, 12, 30, 22, 25, 28])).toBe(20);
  });

  it('vaut 0 (aucun rattrapage) sous 5 heros', () => {
    expect(catchUpCapLevel([40, 38, 35, 30])).toBe(0);
    expect(catchUpCapLevel([])).toBe(0);
  });

  it('fonctionne a exactement 5 heros', () => {
    expect(catchUpCapLevel([9, 7, 5, 3, 1])).toBe(1);
  });

  it('gere les niveaux ex aequo', () => {
    expect(catchUpCapLevel([10, 10, 10, 10, 10, 2])).toBe(10);
  });

  it('ne modifie pas le tableau recu', () => {
    const levels = [3, 9, 1, 7, 5];
    catchUpCapLevel(levels);
    expect(levels).toEqual([3, 9, 1, 7, 5]);
  });
});

describe("Rattrapage d'XP — multiplicateur", () => {
  it('booste un heros sous le plafond', () => {
    expect(catchUpXpMult(12, 20)).toBe(CATCH_UP_XP_MULT);
    expect(catchUpXpMult(1, 20)).toBe(CATCH_UP_XP_MULT);
  });

  it('ne booste PAS un heros pile au plafond', () => {
    expect(catchUpXpMult(20, 20)).toBe(1);
  });

  it('ne booste pas un heros au-dessus du plafond', () => {
    expect(catchUpXpMult(30, 20)).toBe(1);
  });

  it("n'accorde rien quand il n'y a pas de plafond (< 5 heros)", () => {
    expect(catchUpXpMult(1, 0)).toBe(1);
  });

  it('reste neutre au niveau max', () => {
    expect(catchUpXpMult(MAX_LEVEL, MAX_LEVEL)).toBe(1);
  });

  it("s'eteint de lui-meme quand le heros rattrape l'escouade", () => {
    const roster = [30, 28, 25, 22, 20];
    const cap = catchUpCapLevel([...roster, 19]);
    expect(catchUpXpMult(19, cap)).toBe(CATCH_UP_XP_MULT);
    // Le meme heros une fois arrive au niveau du 5e : plus de bonus.
    expect(catchUpXpMult(20, cap)).toBe(1);
  });
});

describe("Rattrapage d'XP — le bonus s'arrête au plafond", () => {
  const CAP = 20;

  /** Niveau atteint pour un gain BRUT donné, en partant de `from` niveau 0 XP. */
  const levelAfter = (from: number, gained: number) =>
    applyCatchUpXpGain(from, 0, gained, CAP).level;

  it('ne dépasse JAMAIS le plafond grâce au multiplicateur', () => {
    // Un lot énorme sur un héros très en retard : sans le garde, ×5 le propulsait
    // au-delà du 5e héros. Le surplus doit désormais être crédité au taux normal.
    const brut = 500_000;
    const avecGarde = levelAfter(5, brut);
    // Référence : le MÊME lot déjà multiplié par 5 et appliqué d'un bloc.
    const sansGarde = applyXpGain(5, 0, brut * CATCH_UP_XP_MULT).level;
    expect(avecGarde).toBeLessThan(sansGarde);
  });

  it('un héros sous le plafond y arrive plus vite qu’au taux normal', () => {
    const gained = 20_000;
    expect(levelAfter(5, gained)).toBeGreaterThan(applyXpGain(5, 0, gained).level);
  });

  it('au-delà du plafond, le gain est strictement identique au taux normal', () => {
    // Départ AU plafond : plus aucun bonus, quel que soit le montant.
    for (const gained of [100, 5_000, 200_000]) {
      expect(applyCatchUpXpGain(CAP, 0, gained, CAP)).toEqual(applyXpGain(CAP, 0, gained));
      expect(applyCatchUpXpGain(CAP + 3, 0, gained, CAP)).toEqual(applyXpGain(CAP + 3, 0, gained));
    }
  });

  it('sans plafond (moins de 5 héros), comportement normal', () => {
    for (const gained of [100, 50_000]) {
      expect(applyCatchUpXpGain(7, 0, gained, 0)).toEqual(applyXpGain(7, 0, gained));
    }
  });

  it('un gain nul ou négatif ne change rien', () => {
    expect(applyCatchUpXpGain(8, 40, 0, CAP)).toEqual({ level: 8, xp: 40, levelsGained: 0 });
    expect(applyCatchUpXpGain(8, 40, -50, CAP)).toEqual({ level: 8, xp: 40, levelsGained: 0 });
  });

  it('respecte toujours le niveau maximum', () => {
    const r = applyCatchUpXpGain(1, 0, 100_000_000, MAX_LEVEL);
    expect(r.level).toBe(MAX_LEVEL);
    expect(r.xp).toBe(0);
  });

  it('la progression reste monotone (plus d’XP ne donne jamais moins)', () => {
    const niveaux = [0, 1_000, 10_000, 100_000, 400_000].map((g) => levelAfter(5, g));
    expect(niveaux).toEqual([...niveaux].sort((a, b) => a - b));
  });
});

describe("Rattrapage d'XP — équivalence exacte au franchissement", () => {
  const CAP = 20;

  it('le surplus au-delà du plafond vaut EXACTEMENT un gain au taux normal', () => {
    // XP BRUTE strictement nécessaire pour amener le héros de 5 à 20 avec le bonus.
    let brutJusquAuCap = 0;
    for (let lvl = 5; lvl < CAP; lvl++) {
      brutJusquAuCap += Math.ceil(xpToNextLevel(lvl) / CATCH_UP_XP_MULT);
    }
    // On vérifie d'abord que ce montant amène pile au plafond, sans le dépasser.
    expect(applyCatchUpXpGain(5, 0, brutJusquAuCap, CAP).level).toBe(CAP);

    // Puis qu'un surplus se comporte comme un gain ORDINAIRE depuis le plafond.
    // On compare niveau + XP : `levelsGained` diffère légitimement, le rattrapage
    // ayant gravi les niveaux menant au plafond.
    for (const surplus of [500, 12_000, 90_000]) {
      const total = applyCatchUpXpGain(5, 0, brutJusquAuCap + surplus, CAP);
      const normal = applyXpGain(CAP, 0, surplus);
      expect({ level: total.level, xp: total.xp }).toEqual({ level: normal.level, xp: normal.xp });
    }
  });

  it('un héros très en retard ne double PAS le 5e après un long farm', () => {
    // Scénario signalé : gros lot accumulé sur un héros loin derrière.
    const roster = [30, 28, 25, 22, 20];
    const cap = catchUpCapLevel([...roster, 6]);
    const retardataire = applyCatchUpXpGain(6, 0, 60_000, cap);
    // Il rattrape, mais son NIVEAU ne peut pas venir du bonus au-delà du plafond.
    const sansBonus = applyXpGain(6, 0, 60_000).level;
    expect(retardataire.level).toBeGreaterThan(sansBonus); // le bonus a bien servi
    const bonusPur = applyXpGain(6, 0, 60_000 * CATCH_UP_XP_MULT).level;
    expect(retardataire.level).toBeLessThan(bonusPur); // mais il a été coupé au cap
  });
});
