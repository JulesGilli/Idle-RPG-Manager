import { describe, expect, it } from 'vitest';
import { resolveCombat } from './resolveCombat.ts';
import type { CombatantInput } from './types.ts';

function fighter(overrides: Partial<CombatantInput> & { id: string }): CombatantInput {
  return {
    name: overrides.id,
    role: 'dps',
    hp: 50,
    atk: 10,
    def: 5,
    speed: 10,
    ...overrides,
  };
}

describe('resolveCombat', () => {
  it('victoire évidente : allié surpuissant contre ennemi fragile', () => {
    const result = resolveCombat({
      allies: [fighter({ id: 'hero', hp: 200, atk: 50, def: 20, speed: 20 })],
      enemies: [fighter({ id: 'goblin', role: 'enemy', hp: 20, atk: 2, def: 0, speed: 1 })],
      seed: 1,
    });

    expect(result.result).toBe('win');
    expect(result.finalState.find((f) => f.id === 'hero')?.alive).toBe(true);
    expect(result.finalState.find((f) => f.id === 'goblin')?.alive).toBe(false);
  });

  it('défaite évidente : allié fragile contre ennemi surpuissant', () => {
    const result = resolveCombat({
      allies: [fighter({ id: 'hero', hp: 20, atk: 2, def: 0, speed: 1 })],
      enemies: [fighter({ id: 'boss', role: 'enemy', hp: 200, atk: 50, def: 20, speed: 20 })],
      seed: 1,
    });

    expect(result.result).toBe('loss');
    expect(result.finalState.find((f) => f.id === 'hero')?.alive).toBe(false);
  });

  it("stats égales : l'équipe qui agit en premier (alliés) l'emporte", () => {
    const result = resolveCombat({
      allies: [fighter({ id: 'ally' })],
      enemies: [fighter({ id: 'enemy', role: 'enemy' })],
      seed: 42,
    });

    // À stats identiques, les alliés frappent en premier chaque tour → victoire.
    expect(result.result).toBe('win');
  });

  it('déterminisme : même seed → mêmes événements', () => {
    const input = {
      allies: [fighter({ id: 'a', hp: 80 }), fighter({ id: 'b', role: 'healer' as const, atk: 8 })],
      enemies: [
        fighter({ id: 'e1', role: 'enemy' as const, hp: 60 }),
        fighter({ id: 'e2', role: 'enemy' as const, hp: 60 }),
      ],
      seed: 12345,
    };

    const a = resolveCombat(input);
    const b = resolveCombat(input);
    expect(a.events).toEqual(b.events);
    expect(a.result).toBe(b.result);
  });

  it('seeds différentes peuvent produire des combats différents', () => {
    const base = {
      allies: [fighter({ id: 'a', hp: 60, atk: 12 })],
      enemies: [fighter({ id: 'e', role: 'enemy' as const, hp: 60, atk: 12 })],
    };
    const r1 = resolveCombat({ ...base, seed: 1 });
    const r2 = resolveCombat({ ...base, seed: 999 });
    // Le nombre de rounds ou la trace diffèrent selon la seed (variance des dégâts).
    const differs =
      r1.rounds !== r2.rounds || JSON.stringify(r1.events) !== JSON.stringify(r2.events);
    expect(differs).toBe(true);
  });

  it("le soigneur émet des soins et prolonge la survie de l'équipe", () => {
    const result = resolveCombat({
      allies: [
        fighter({ id: 'tank', role: 'tank', hp: 120, atk: 8, def: 10, speed: 6 }),
        fighter({ id: 'healer', role: 'healer', hp: 85, atk: 12, def: 5, speed: 9 }),
      ],
      enemies: [fighter({ id: 'ogre', role: 'enemy', hp: 90, atk: 16, def: 4, speed: 8 })],
      seed: 7,
    });

    expect(result.events.some((e) => e.type === 'heal')).toBe(true);
  });

  it('cap de rounds atteint → défaite', () => {
    const result = resolveCombat({
      allies: [fighter({ id: 'a', hp: 1000, atk: 1, def: 999, speed: 5 })],
      enemies: [fighter({ id: 'e', role: 'enemy', hp: 1000, atk: 1, def: 999, speed: 5 })],
      seed: 3,
      maxRounds: 2,
    });

    expect(result.rounds).toBe(2);
    expect(result.result).toBe('loss');
  });
});
