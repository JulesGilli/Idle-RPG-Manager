import { describe, expect, it } from 'vitest';
import {
  resolveDeploymentBatch,
  fightsForElapsed,
  SECONDS_PER_FIGHT,
  OFFLINE_FIGHT_CAP,
} from './deployment.ts';
import type { CombatantInput } from '../combat/types.ts';
import type { LevelDef } from './deployment.ts';

function levels(): LevelDef[] {
  return [0, 1, 2].map((i) => ({
    index: i,
    difficulty: i + 1,
    isBoss: false,
    enemies: [
      {
        id: `e${i}`,
        name: `Ennemi ${i}`,
        role: 'enemy',
        hp: 20 + i * 10,
        atk: 4,
        def: 1,
        speed: 5,
      },
    ],
  }));
}

const STRONG: CombatantInput[] = [
  { id: 'h1', name: 'Hero', role: 'dps', hp: 300, atk: 60, def: 20, speed: 20 },
];
const WEAK: CombatantInput[] = [
  { id: 'h1', name: 'Faible', role: 'dps', hp: 12, atk: 1, def: 0, speed: 1 },
];

describe('fightsForElapsed', () => {
  it('un combat par intervalle, plafonné', () => {
    expect(fightsForElapsed(0)).toBe(0);
    expect(fightsForElapsed(SECONDS_PER_FIGHT)).toBe(1);
    expect(fightsForElapsed(SECONDS_PER_FIGHT * 5)).toBe(5);
    // Plafonné à OFFLINE_FIGHT_CAP, et EXACTEMENT lui pour un temps très long.
    expect(fightsForElapsed(SECONDS_PER_FIGHT * 100000)).toBe(OFFLINE_FIGHT_CAP);
  });
});

describe('resolveDeploymentBatch', () => {
  it('équipe forte en mode advance : progresse et accumule des gains', () => {
    const r = resolveDeploymentBatch({
      allies: STRONG,
      levels: levels(),
      startIndex: 0,
      mode: 'advance',
      fights: 5,
      seed: 1,
    });
    expect(r.wins).toBeGreaterThan(0);
    expect(r.endIndex).toBeGreaterThan(0);
    expect(r.xpPerHero).toBeGreaterThan(0);
    expect(r.gold).toBeGreaterThan(0);
    expect(r.clearedIndices.length).toBeGreaterThan(0);
  });

  it('mode loop : reste sur le même niveau malgré les victoires', () => {
    const r = resolveDeploymentBatch({
      allies: STRONG,
      levels: levels(),
      startIndex: 1,
      mode: 'loop',
      fights: 6,
      seed: 3,
    });
    expect(r.endIndex).toBe(1);
    expect(r.wins).toBe(6);
  });

  it('équipe faible : perd et ne dépasse pas le niveau 0', () => {
    const r = resolveDeploymentBatch({
      allies: WEAK,
      levels: levels(),
      startIndex: 0,
      mode: 'advance',
      fights: 8,
      seed: 2,
    });
    expect(r.wins).toBe(0);
    expect(r.endIndex).toBe(0);
    expect(r.losses).toBe(8);
  });

  it('déterministe pour une même seed', () => {
    const args = {
      allies: STRONG,
      levels: levels(),
      startIndex: 0,
      mode: 'advance' as const,
      fights: 4,
      seed: 999,
    };
    const a = resolveDeploymentBatch(args);
    const b = resolveDeploymentBatch(args);
    expect(a).toEqual(b);
  });

  it('arc 1 explicite = comportement par défaut (rétro-compat stricte)', () => {
    const base = {
      allies: STRONG,
      levels: levels(),
      startIndex: 0,
      mode: 'advance' as const,
      fights: 4,
      seed: 999,
    };
    expect(resolveDeploymentBatch({ ...base, arc: 1 })).toEqual(resolveDeploymentBatch(base));
  });

  it('arc 2 nettement plus dur : la même équipe progresse moins qu\'en arc 1', () => {
    const base = {
      allies: STRONG,
      levels: levels(),
      startIndex: 0,
      mode: 'advance' as const,
      fights: 8,
      seed: 5,
    };
    const a1 = resolveDeploymentBatch({ ...base, arc: 1 });
    const a2 = resolveDeploymentBatch({ ...base, arc: 2 });
    expect(a2.wins).toBeLessThan(a1.wins);
    expect(a2.endIndex).toBeLessThanOrEqual(a1.endIndex);
  });

  it('zéro combat = aucun changement', () => {
    const r = resolveDeploymentBatch({
      allies: STRONG,
      levels: levels(),
      startIndex: 2,
      mode: 'advance',
      fights: 0,
      seed: 1,
    });
    expect(r.endIndex).toBe(2);
    expect(r.wins).toBe(0);
    expect(r.lastCombat).toBeNull();
  });
});
