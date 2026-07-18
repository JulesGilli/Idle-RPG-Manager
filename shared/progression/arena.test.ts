import { describe, expect, it } from 'vitest';
import {
  canChallenge,
  arenaChallengeCooldownRemaining,
  ARENA_CHALLENGE_COOLDOWN_SECONDS,
  ARENA_CHALLENGE_RANGE,
  isoWeekKey,
  arenaWeeklyReward,
  arenaRewardZone,
  arenaRewardEligible,
  MAX_ZONE,
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
    expect(arenaWeeklyReward(1, 0, 'z', 'y').gold).toBe(0);
    const top50 = arenaWeeklyReward(1, 50, 'z', 'y').gold;
    const top10 = arenaWeeklyReward(1, 10, 'z', 'y').gold;
    expect(top50).toBeGreaterThan(top10); // plus de participants → plus d'or
    const first = arenaWeeklyReward(1, 20, 'z', 'y').gold;
    const tenth = arenaWeeklyReward(10, 20, 'z', 'y').gold;
    expect(first).toBeGreaterThan(tenth); // meilleur rang → plus d'or
    expect(arenaWeeklyReward(1, 20, 'z', 'y').materials.length).toBeGreaterThan(0);
  });
});

describe('Arène — zone de référence du butin', () => {
  it('donne la zone du 1er +1', () => {
    expect(arenaRewardZone(5)).toBe(6);
    expect(arenaRewardZone(1)).toBe(2);
  });

  it('ne dépasse jamais la zone 10', () => {
    expect(arenaRewardZone(10)).toBe(MAX_ZONE);
    expect(arenaRewardZone(99)).toBe(MAX_ZONE);
  });

  it('reste sain sur une zone absente ou nulle', () => {
    expect(arenaRewardZone(0)).toBe(2);
    expect(arenaRewardZone(-3)).toBe(2);
  });

  it("un leader zone 5 ne fait plus tomber de matériau de zone 10", () => {
    // Le cas signalé : classement d'un seul joueur, zone 5.
    const zone = arenaRewardZone(5);
    expect(zone).toBeLessThan(MAX_ZONE);
    const reward = arenaWeeklyReward(1, 1, `farm_z${zone}`, `farm_z${zone - 1}`);
    expect(reward.materials[0]!.key).toBe('farm_z6');
  });
});

describe('Arène — éligibilité à la récompense', () => {
  it('exige au moins un combat disputé', () => {
    expect(arenaRewardEligible(0, 0)).toBe(false); // inscrit, jamais joué
    expect(arenaRewardEligible(1, 0)).toBe(true);
    expect(arenaRewardEligible(0, 1)).toBe(true); // une défaite compte aussi
    expect(arenaRewardEligible(3, 2)).toBe(true);
  });
});
