import { describe, expect, it } from 'vitest';
import { normalizeCode, isValidCodeFormat, describeReward } from './redeem.ts';

describe('redeem codes', () => {
  it('normalise : majuscules, sans espaces ni tirets', () => {
    expect(normalizeCode('  welcome ')).toBe('WELCOME');
    expect(normalizeCode('free-gold 2026')).toBe('FREEGOLD2026');
    expect(normalizeCode('AbC')).toBe('ABC');
  });

  it('valide le format (3–24 alphanumériques)', () => {
    expect(isValidCodeFormat('WELCOME')).toBe(true);
    expect(isValidCodeFormat('AB')).toBe(false);
    expect(isValidCodeFormat('WITH SPACE')).toBe(false);
    expect(isValidCodeFormat(normalizeCode('with-dash'))).toBe(true);
  });

  it('décrit une récompense de façon lisible', () => {
    expect(describeReward({ gold: 500, materials: [{ key: 'ecorce', qty: 20 }], item: true })).toEqual([
      '500 or',
      '20× ecorce',
      'objet ultime de zone 10',
    ]);
    expect(describeReward({})).toEqual([]);
  });
});
