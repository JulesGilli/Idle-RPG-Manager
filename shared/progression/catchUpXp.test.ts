import { describe, expect, it } from 'vitest';
import {
  catchUpCapLevel,
  catchUpXpMult,
  CATCH_UP_XP_MULT,
  MAX_LEVEL,
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
