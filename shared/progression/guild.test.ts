import { describe, expect, it } from 'vitest';
import {
  canKick,
  canManageMembers,
  canSetRole,
  canStartRaid,
  canDisband,
  guildLevel,
  guildLevelProgress,
  raidCooldownRemaining,
  raidCooldownSeconds,
  guildContributionPoints,
  guildXpForRaid,
} from './guild.ts';

describe('rôles de guilde', () => {
  it('fondateur/officier peuvent gérer et lancer un raid ; pas le membre', () => {
    expect(canManageMembers('founder')).toBe(true);
    expect(canManageMembers('officer')).toBe(true);
    expect(canManageMembers('member')).toBe(false);
    expect(canStartRaid('officer')).toBe(true);
    expect(canStartRaid('member')).toBe(false);
  });

  it('seul le fondateur change les rôles et dissout', () => {
    expect(canSetRole('founder')).toBe(true);
    expect(canSetRole('officer')).toBe(false);
    expect(canDisband('founder')).toBe(true);
    expect(canDisband('officer')).toBe(false);
  });

  it('exclusion : rang strictement supérieur, le fondateur est inexcluable', () => {
    expect(canKick('founder', 'officer')).toBe(true);
    expect(canKick('founder', 'member')).toBe(true);
    expect(canKick('officer', 'member')).toBe(true);
    expect(canKick('officer', 'officer')).toBe(false);
    expect(canKick('officer', 'founder')).toBe(false);
    expect(canKick('member', 'member')).toBe(false);
    // Personne ne peut exclure le fondateur.
    expect(canKick('founder', 'founder')).toBe(false);
  });
});

describe('progression de guilde', () => {
  it('niveau croît avec l’XP par paliers croissants (500·L)', () => {
    expect(guildLevel(0)).toBe(1);
    expect(guildLevel(499)).toBe(1);
    expect(guildLevel(500)).toBe(2); // 1→2 : 500
    expect(guildLevel(1499)).toBe(2);
    expect(guildLevel(1500)).toBe(3); // +1000
  });

  it('guildLevelProgress renseigne le palier courant', () => {
    const p = guildLevel(600);
    expect(p).toBe(2);
    const prog = guildLevelProgress(600);
    expect(prog.level).toBe(2);
    expect(prog.intoLevel).toBe(100); // 600 - 500
    expect(prog.neededForNext).toBe(1000);
  });
});

describe('raid : cooldown / récompenses', () => {
  it('cooldown : plein juste après, nul après la durée, croît avec le tier', () => {
    const now = 1_000_000_000_000;
    const t1 = raidCooldownSeconds(1);
    const t3 = raidCooldownSeconds(3);
    expect(t3).toBeGreaterThan(t1); // raid plus dur → repos plus long
    expect(raidCooldownRemaining(now, 1, now)).toBe(t1);
    expect(raidCooldownRemaining(now - t1 * 1000, 1, now)).toBe(0);
    expect(raidCooldownRemaining(null, 1, now)).toBe(0);
  });

  it('contribution : plus de héros + réussite → plus de points', () => {
    expect(guildContributionPoints(5, true)).toBe(50);
    expect(guildContributionPoints(5, false)).toBe(15);
    expect(guildContributionPoints(0, true)).toBe(0);
  });

  it('XP de raid : bonus de clear, sinon proportionnel à la progression', () => {
    const cleared = guildXpForRaid(true, 11, 12);
    const wiped = guildXpForRaid(false, 5, 12);
    expect(cleared).toBeGreaterThan(wiped);
    expect(wiped).toBeGreaterThan(0);
  });
});
