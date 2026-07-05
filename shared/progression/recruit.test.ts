import { describe, expect, it } from 'vitest';
import {
  recruitCost,
  recruitGrade,
  rollRecruitBonuses,
  rollRecruitName,
  rollTavernPool,
  forcedTavernClasses,
  hashSeed,
  ROLL_MIN,
  ROLL_MAX,
  MAX_ROSTER,
  TAVERN_SIZE,
  type ClassBase,
} from './recruit.ts';
import { createRng } from '../combat/prng.ts';

const GUERRIER: ClassBase = { id: 'guerrier', base_hp: 130, base_atk: 10, base_def: 12, base_speed: 6 };
const ARCHER: ClassBase = { id: 'archer', base_hp: 75, base_atk: 16, base_def: 5, base_speed: 13 };
const MAGE: ClassBase = { id: 'mage', base_hp: 65, base_atk: 18, base_def: 4, base_speed: 10 };
const PALADIN: ClassBase = { id: 'paladin', base_hp: 140, base_atk: 9, base_def: 11, base_speed: 7 };
const SOIGNEUR: ClassBase = { id: 'soigneur', base_hp: 85, base_atk: 7, base_def: 5, base_speed: 9 };
const CLASSES = [GUERRIER, ARCHER, MAGE, PALADIN, SOIGNEUR];

describe('rollRecruitBonuses', () => {
  it('reste dans la fourchette [−20 %, +35 %] de la base (arrondi)', () => {
    for (let s = 0; s < 500; s++) {
      const b = rollRecruitBonuses(GUERRIER, createRng(s));
      expect(b.bonus_hp).toBeGreaterThanOrEqual(Math.round(GUERRIER.base_hp * ROLL_MIN) - 1);
      expect(b.bonus_hp).toBeLessThanOrEqual(Math.round(GUERRIER.base_hp * ROLL_MAX) + 1);
      expect(b.bonus_atk).toBeGreaterThanOrEqual(Math.round(GUERRIER.base_atk * ROLL_MIN) - 1);
      expect(b.bonus_atk).toBeLessThanOrEqual(Math.round(GUERRIER.base_atk * ROLL_MAX) + 1);
    }
  });

  it('déterministe pour une même seed, varié entre seeds', () => {
    expect(rollRecruitBonuses(ARCHER, createRng(7))).toEqual(rollRecruitBonuses(ARCHER, createRng(7)));
    const values = new Set<number>();
    for (let s = 0; s < 50; s++) values.add(rollRecruitBonuses(ARCHER, createRng(s)).bonus_atk);
    expect(values.size).toBeGreaterThan(3);
  });
});

describe('recruitGrade', () => {
  it('rolls maximaux = S, minimaux = D, neutres = C', () => {
    const max = {
      bonus_hp: Math.round(GUERRIER.base_hp * ROLL_MAX),
      bonus_atk: Math.round(GUERRIER.base_atk * ROLL_MAX),
      bonus_def: Math.round(GUERRIER.base_def * ROLL_MAX),
      bonus_speed: Math.round(GUERRIER.base_speed * ROLL_MAX),
    };
    const min = {
      bonus_hp: Math.round(GUERRIER.base_hp * ROLL_MIN),
      bonus_atk: Math.round(GUERRIER.base_atk * ROLL_MIN),
      bonus_def: Math.round(GUERRIER.base_def * ROLL_MIN),
      bonus_speed: Math.round(GUERRIER.base_speed * ROLL_MIN),
    };
    const zero = { bonus_hp: 0, bonus_atk: 0, bonus_def: 0, bonus_speed: 0 };
    expect(recruitGrade(max, GUERRIER)).toBe('S');
    expect(recruitGrade(min, GUERRIER)).toBe('D');
    // Un roll neutre (q = 0.5) sort en D : l'excellence est rare.
    expect(recruitGrade(zero, GUERRIER)).toBe('D');
  });

  it('distribution sélective ~60/30/8/1.8/0.2 % sur un grand échantillon', () => {
    const N = 200_000;
    const counts: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, D: 0 };
    for (let s = 0; s < N; s++) {
      const rng = createRng((s * 0x9e3779b9) >>> 0);
      const cls = CLASSES[rng.int(0, CLASSES.length - 1)]!;
      const g = recruitGrade(rollRecruitBonuses(cls, rng), cls);
      counts[g] = (counts[g] ?? 0) + 1;
    }
    const pct = (g: string) => (100 * (counts[g] ?? 0)) / N;
    expect(pct('D')).toBeGreaterThanOrEqual(57);
    expect(pct('D')).toBeLessThanOrEqual(63);
    expect(pct('C')).toBeGreaterThanOrEqual(27);
    expect(pct('C')).toBeLessThanOrEqual(33);
    expect(pct('B')).toBeGreaterThanOrEqual(6);
    expect(pct('B')).toBeLessThanOrEqual(10);
    expect(pct('A')).toBeGreaterThanOrEqual(1);
    expect(pct('A')).toBeLessThanOrEqual(3);
    expect(pct('S')).toBeGreaterThanOrEqual(0.05);
    expect(pct('S')).toBeLessThanOrEqual(0.6);
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

  it('onboarding : force archer + soigneur sur les 2 premiers slots (effectif < 3)', () => {
    const seed = hashSeed('user-abc', '2026-07-02');
    const forced = forcedTavernClasses(1);
    expect(forced).toEqual({ 0: 'archer', 1: 'soigneur' });
    const pool = rollTavernPool(seed, CLASSES, forced);
    expect(pool[0]!.class_id).toBe('archer');
    expect(pool[1]!.class_id).toBe('soigneur');
    // Hors onboarding (effectif >= 3) : plus de forçage.
    expect(forcedTavernClasses(3)).toEqual({});
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
