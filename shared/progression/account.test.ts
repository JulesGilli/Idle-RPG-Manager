import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_XP_SHARE,
  accountXpFromHeroXp,
  accountProgress,
  accountLevel,
  accountXpToNext,
  isActivityUnlocked,
  ACTIVITY_UNLOCKS,
} from './account.ts';

describe('account progression', () => {
  it('reverse 10% de l’XP héros au compte (arrondi bas)', () => {
    expect(ACCOUNT_XP_SHARE).toBe(0.1);
    expect(accountXpFromHeroXp(0)).toBe(0);
    expect(accountXpFromHeroXp(99)).toBe(9);
    expect(accountXpFromHeroXp(250)).toBe(25);
    expect(accountXpFromHeroXp(-50)).toBe(0);
  });

  it('commence au niveau 1 et progresse par paliers cumulés', () => {
    expect(accountLevel(0)).toBe(1);
    expect(accountProgress(0)).toEqual({ level: 1, xpInLevel: 0, xpForLevel: accountXpToNext(1) });
    const toL2 = accountXpToNext(1);
    expect(accountLevel(toL2 - 1)).toBe(1);
    expect(accountLevel(toL2)).toBe(2);
    expect(accountLevel(toL2 + accountXpToNext(2))).toBe(3);
  });

  it('les paliers de niveau sont croissants', () => {
    for (let l = 1; l < 15; l++) {
      expect(accountXpToNext(l + 1)).toBeGreaterThan(accountXpToNext(l));
    }
  });

  it('débloque les activités selon le niveau requis', () => {
    expect(isActivityUnlocked('inventory', 1)).toBe(false);
    expect(isActivityUnlocked('inventory', ACTIVITY_UNLOCKS.inventory)).toBe(true);
    expect(isActivityUnlocked('guild', ACTIVITY_UNLOCKS.guild - 1)).toBe(false);
    expect(isActivityUnlocked('guild', ACTIVITY_UNLOCKS.guild)).toBe(true);
  });
});
