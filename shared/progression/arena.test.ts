import { describe, expect, it } from 'vitest';
import {
  canChallenge,
  arenaChallengeCooldownRemaining,
  ARENA_CHALLENGE_COOLDOWN_SECONDS,
  ARENA_CHALLENGE_RANGE,
  isoWeekKey,
  arenaWeeklyReward,
} from './arena.ts';

describe('arène PvP', () => {
  it('on ne défie qu’au-dessus, dans la fenêtre de rangs', () => {
    expect(canChallenge(10, 9)).toBe(true); // 1 au-dessus
    expect(canChallenge(10, 10 - ARENA_CHALLENGE_RANGE)).toBe(true); // pile à portée
    expect(canChallenge(10, 10 - ARENA_CHALLENGE_RANGE - 1)).toBe(false); // trop haut
    expect(canChallenge(10, 11)).toBe(false); // en dessous
    expect(canChallenge(10, 10)).toBe(false); // soi-même
  });

  it('cooldown de défi', () => {
    const now = 1_000_000_000_000;
    const cd = ARENA_CHALLENGE_COOLDOWN_SECONDS;
    expect(arenaChallengeCooldownRemaining(now, now)).toBe(cd);
    expect(arenaChallengeCooldownRemaining(now - cd * 1000, now)).toBe(0);
    expect(arenaChallengeCooldownRemaining(null, now)).toBe(0);
  });

  it('semaine ISO', () => {
    expect(isoWeekKey('2026-07-07')).toBe('2026-W28');
    expect(isoWeekKey('2026-01-01')).toBe('2026-W01');
    // Deux jours de la même semaine ISO donnent la même clé.
    expect(isoWeekKey('2026-07-06')).toBe(isoWeekKey('2026-07-07'));
  });

  it('récompense hebdo : croît avec les participants, décroît avec le rang', () => {
    expect(arenaWeeklyReward(1, 0).gold).toBe(0);
    const top50 = arenaWeeklyReward(1, 50).gold;
    const top10 = arenaWeeklyReward(1, 10).gold;
    expect(top50).toBeGreaterThan(top10); // plus de participants → plus d'or
    const first = arenaWeeklyReward(1, 20).gold;
    const tenth = arenaWeeklyReward(10, 20).gold;
    expect(first).toBeGreaterThan(tenth); // meilleur rang → plus d'or
    expect(arenaWeeklyReward(1, 20).materials.length).toBeGreaterThan(0);
  });
});
