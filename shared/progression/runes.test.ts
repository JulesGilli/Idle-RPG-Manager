import { describe, expect, it } from 'vitest';
import { canAwaken, runeExtractableSets, isRuneSet, runeAbilities, AWAKEN_LEVEL } from './runes.ts';

describe('canAwaken', () => {
  it('exige grade S + niveau max, et pas déjà éveillé', () => {
    expect(canAwaken('S', AWAKEN_LEVEL, false)).toBe(true);
    expect(canAwaken('A', AWAKEN_LEVEL, false)).toBe(false); // pas S
    expect(canAwaken('S', AWAKEN_LEVEL - 1, false)).toBe(false); // pas niveau max
    expect(canAwaken('S', AWAKEN_LEVEL, true)).toBe(false); // déjà éveillé
  });
});

describe('sets extractibles en rune', () => {
  it('uniquement les sets à effet 2-pièces', () => {
    const ids = runeExtractableSets().map((s) => s.id).sort();
    expect(ids).toEqual(
      ['ame_offerte', 'arcaniste', 'brute', 'empoisonneur', 'provocateur', 'pyromane'].sort(),
    );
  });
  it('isRuneSet distingue 2-pièces vs 4-pièces', () => {
    expect(isRuneSet('pyromane')).toBe(true); // 2-pièces
    expect(isRuneSet('colosse')).toBe(false); // 4-pièces
    expect(isRuneSet('inconnu')).toBe(false);
  });
});

describe('runeAbilities', () => {
  it('rend l’effet 2-pièces du set', () => {
    expect(runeAbilities('pyromane')).toEqual([{ kind: 'dmg_type_amp', damageType: 'fire', value: 0.35 }]);
    expect(runeAbilities('provocateur')).toEqual([{ kind: 'threat', value: 6 }]);
  });
  it('vide pour un set 4-pièces ou inconnu', () => {
    expect(runeAbilities('colosse')).toEqual([]);
    expect(runeAbilities(null)).toEqual([]);
  });
});
