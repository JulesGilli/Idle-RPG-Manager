import { describe, expect, it } from 'vitest';
import { resolveCombat } from './resolveCombat.ts';
import type { CombatantInput } from './types.ts';

/**
 * `reckless` (set Cri de Ralliement, arc 2) : gros bonus d'ATK, mais une part
 * des attaques de base part sur un allié. Seule abilité qui retourne une frappe
 * contre son propre camp.
 */
const RECKLESS: CombatantInput['abilities'] = [
  { kind: 'reckless', atkBonus: 1.5, friendlyFire: 0.2 },
];

const brute = (abilities: CombatantInput['abilities'] = []): CombatantInput => ({
  id: 'h1', name: 'Enragé', role: 'dps', hp: 50_000, atk: 400, def: 0, speed: 20, abilities,
});
const buddy = (): CombatantInput => ({
  id: 'h2', name: 'Camarade', role: 'tank', hp: 50_000, atk: 1, def: 0, speed: 2,
});
const bag = (): CombatantInput => ({
  id: 'e1', name: 'Mannequin', role: 'enemy', hp: 9_000_000, atk: 0, def: 0, speed: 1,
});

function run(abilities: CombatantInput['abilities'], seed: number) {
  const c = resolveCombat({
    allies: [brute(abilities), buddy()],
    enemies: [bag()],
    seed,
    maxRounds: 25,
  });
  return {
    buddyHp: c.finalState.find((f) => f.id === 'h2')!.hp,
    foeHp: c.finalState.find((f) => f.id === 'e1')!.hp,
  };
}

describe('reckless — fureur aveugle', () => {
  it('frappe BEAUCOUP plus fort', () => {
    // Sur la même graine, le mannequin doit encaisser davantage.
    expect(run(RECKLESS, 3).foeHp).toBeLessThan(run([], 3).foeHp);
  });

  it('blesse ses propres alliés — c’est le COÛT', () => {
    // Le mannequin grignote le camarade (le moteur impose 1 dégât minimum, même
    // à ATK 0) : on ne compare donc pas à zéro mais à l'ORDRE DE GRANDEUR. Une
    // frappe du porteur coûte des centaines de PV, un tic de mannequin en coûte 1.
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
    const grosseFrappe = seeds.some((s) => 50_000 - run(RECKLESS, s).buddyHp > 300);
    expect(grosseFrappe).toBe(true);
  });

  it('sans l’abilité, aucun allié ne prend de GROS coup de son propre camp', () => {
    // Le témoin : prouve que le tir allié vient bien de  et non du
    // moteur. Seul le grignotage du mannequin subsiste.
    for (const s of [1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(50_000 - run([], s).buddyHp).toBeLessThan(300);
    }
  });
});
