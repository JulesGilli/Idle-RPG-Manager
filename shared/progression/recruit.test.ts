import { describe, expect, it } from 'vitest';
import {
  recruitCost,
  recruitGrade,
  rollRecruitBonuses,
  rollRecruitName,
  rollTavernPool,
  hashSeed,
  ROLL_MIN,
  ROLL_MAX,
  MAX_ROSTER,
  TAVERN_SIZE,
  type ClassBase,
} from './recruit.ts';
import { createRng } from '../combat/prng.ts';

const TANK: ClassBase = { id: 'tank', base_hp: 120, base_atk: 8, base_def: 10, base_speed: 6 };
const DPS: ClassBase = { id: 'dps', base_hp: 70, base_atk: 16, base_def: 4, base_speed: 12 };
const HEALER: ClassBase = { id: 'healer', base_hp: 85, base_atk: 7, base_def: 5, base_speed: 9 };
const CLASSES = [TANK, DPS, HEALER];

describe('rollRecruitBonuses', () => {
  it('reste dans la fourchette [−20 %, +35 %] de la base (arrondi)', () => {
    for (let s = 0; s < 500; s++) {
      const b = rollRecruitBonuses(TANK, createRng(s));
      expect(b.bonus_hp).toBeGreaterThanOrEqual(Math.round(TANK.base_hp * ROLL_MIN) - 1);
      expect(b.bonus_hp).toBeLessThanOrEqual(Math.round(TANK.base_hp * ROLL_MAX) + 1);
      expect(b.bonus_atk).toBeGreaterThanOrEqual(Math.round(TANK.base_atk * ROLL_MIN) - 1);
      expect(b.bonus_atk).toBeLessThanOrEqual(Math.round(TANK.base_atk * ROLL_MAX) + 1);
    }
  });

  it('déterministe pour une même seed, varié entre seeds', () => {
    expect(rollRecruitBonuses(DPS, createRng(7))).toEqual(rollRecruitBonuses(DPS, createRng(7)));
    const values = new Set<number>();
    for (let s = 0; s < 50; s++) values.add(rollRecruitBonuses(DPS, createRng(s)).bonus_atk);
    expect(values.size).toBeGreaterThan(3);
  });
});

describe('recruitGrade', () => {
  it('rolls maximaux = S, minimaux = D, neutres = C', () => {
    const max = {
      bonus_hp: Math.round(TANK.base_hp * ROLL_MAX),
      bonus_atk: Math.round(TANK.base_atk * ROLL_MAX),
      bonus_def: Math.round(TANK.base_def * ROLL_MAX),
      bonus_speed: Math.round(TANK.base_speed * ROLL_MAX),
    };
    const min = {
      bonus_hp: Math.round(TANK.base_hp * ROLL_MIN),
      bonus_atk: Math.round(TANK.base_atk * ROLL_MIN),
      bonus_def: Math.round(TANK.base_def * ROLL_MIN),
      bonus_speed: Math.round(TANK.base_speed * ROLL_MIN),
    };
    const zero = { bonus_hp: 0, bonus_atk: 0, bonus_def: 0, bonus_speed: 0 };
    expect(recruitGrade(max, TANK)).toBe('S');
    expect(recruitGrade(min, TANK)).toBe('D');
    expect(recruitGrade(zero, TANK)).toBe('C');
  });
});

describe('recruitCost', () => {
  it('doublement à chaque recrue au-delà de 3', () => {
    expect(recruitCost(3)).toBe(250);
    expect(recruitCost(4)).toBe(500);
    expect(recruitCost(2)).toBe(250);
    expect(MAX_ROSTER).toBe(5);
  });
});

describe('rollTavernPool', () => {
  it('génère TAVERN_SIZE recrues, déterministe pour une même seed', () => {
    const seed = hashSeed('user-abc', '2026-07-02');
    const a = rollTavernPool(seed, CLASSES);
    const b = rollTavernPool(seed, CLASSES);
    expect(a).toHaveLength(TAVERN_SIZE);
    expect(a).toEqual(b);
    expect(a.map((c) => c.slot)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('un jour différent donne un pool différent', () => {
    const p1 = rollTavernPool(hashSeed('user-abc', '2026-07-02'), CLASSES);
    const p2 = rollTavernPool(hashSeed('user-abc', '2026-07-03'), CLASSES);
    const names1 = p1.map((c) => c.name).join(',');
    const names2 = p2.map((c) => c.name).join(',');
    expect(names1).not.toBe(names2);
  });

  it('deux joueurs différents ont des pools différents le même jour', () => {
    const a = rollTavernPool(hashSeed('user-a', '2026-07-02'), CLASSES);
    const b = rollTavernPool(hashSeed('user-b', '2026-07-02'), CLASSES);
    expect(a.map((c) => c.name).join(',')).not.toBe(b.map((c) => c.name).join(','));
  });

  it('produit un mélange de classes et de grades sur un pool', () => {
    const grades = new Set<string>();
    for (let d = 0; d < 40; d++) {
      const pool = rollTavernPool(hashSeed('u', `day-${d}`), CLASSES);
      for (const c of pool) {
        const cls = CLASSES.find((x) => x.id === c.class_id)!;
        grades.add(recruitGrade(c.bonuses, cls));
      }
    }
    // Sur 40 jours × 8 recrues, on doit voir de la variété de grades.
    expect(grades.size).toBeGreaterThanOrEqual(4);
  });
});

describe('hashSeed', () => {
  it('déterministe et sensible aux entrées', () => {
    expect(hashSeed('a', 'b')).toBe(hashSeed('a', 'b'));
    expect(hashSeed('a', 'b')).not.toBe(hashSeed('a', 'c'));
    expect(hashSeed('a', 'b')).not.toBe(hashSeed('b', 'a'));
  });
});

describe('rollRecruitName', () => {
  it('retourne toujours un nom non vide', () => {
    for (let s = 0; s < 40; s++) {
      expect(rollRecruitName(createRng(s)).length).toBeGreaterThan(0);
    }
  });
});
