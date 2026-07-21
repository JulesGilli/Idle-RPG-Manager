import { describe, expect, it } from 'vitest';
import { resolveCombat } from './resolveCombat.ts';
import type { CombatantInput, SummonTemplate } from './types.ts';

/**
 * Sets d'invocation d'arc 2 :
 *  • `summon_extra`   (Charnier)     — élargit le pool du porteur ;
 *  • `summon_on_hit`  (Rituel d'Os)  — ses créatures appliquent un statut.
 *
 * Tous deux sont des MODIFICATEURS portés par l'invocateur : sans invocation, ils
 * ne font rien. C'est leur condition d'emploi, figée ici.
 */
const TPL: SummonTemplate[] = [
  { name: 'Squelette A', hpMult: 0.3, atkMult: 0.3 },
  { name: 'Squelette B', hpMult: 0.3, atkMult: 0.3 },
  { name: 'Squelette C', hpMult: 0.3, atkMult: 0.3 },
  { name: 'Squelette D', hpMult: 0.3, atkMult: 0.3 },
];
// `distinct: false` : le pool tire AVEC remise, donc le +1 du Charnier se voit.
const POOL = { kind: 'summon_pool' as const, count: 1, distinct: false, templates: TPL };

const necro = (abilities: CombatantInput['abilities'] = []): CombatantInput => ({
  id: 'h1', name: 'Nécro', role: 'dps', hp: 100_000, atk: 600, def: 0, speed: 20,
  abilities: [POOL, ...(abilities ?? [])],
});
const mob = (): CombatantInput => ({
  id: 'e1', name: 'Mob', role: 'enemy', hp: 900_000, atk: 20, def: 0, speed: 1,
});

function run(abilities: CombatantInput['abilities']) {
  const c = resolveCombat({ allies: [necro(abilities)], enemies: [mob()], seed: 8, maxRounds: 8 });
  return {
    invocations: c.finalState.filter((f) => f.id.includes('~summon~')).length,
    foeHp: c.finalState.find((f) => f.id === 'e1')!.hp,
    affaiblis: c.events.filter(
      (e) => (e as { message?: string }).message?.toLowerCase().includes('affaibl'),
    ).length,
  };
}

describe('summon_extra — Charnier', () => {
  it('ajoute une créature au pool', () => {
    const sans = run([]).invocations;
    const avec = run([{ kind: 'summon_extra', count: 1 }]).invocations;
    expect(sans).toBeGreaterThan(0); // le témoin doit bien invoquer
    expect(avec).toBe(sans + 1);
  });

  it('plus de créatures = plus de dégâts', () => {
    expect(run([{ kind: 'summon_extra', count: 2 }]).foeHp).toBeLessThan(run([]).foeHp);
  });
});

describe('summon_on_hit — Rituel d’Os', () => {
  it('les INVOCATIONS appliquent le statut (le témoin ne l’applique jamais)', () => {
    expect(run([]).affaiblis).toBe(0);
    // Chance à 1 pour rendre le test déterministe : c'est le CÂBLAGE qu'on
    // vérifie (l'effet passe bien du maître à ses créatures), pas le tirage.
    const avec = run([
      { kind: 'summon_on_hit', status: 'weaken', chance: 1, potency: 0.15, duration: 2 },
    ]);
    expect(avec.affaiblis).toBeGreaterThan(0);
  });
});
