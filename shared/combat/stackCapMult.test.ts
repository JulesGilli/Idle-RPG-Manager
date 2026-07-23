import { describe, expect, it } from 'vitest';
import { resolveCombat } from './resolveCombat.ts';
import type { CombatantInput } from './types.ts';

/**
 * `stack_cap_mult` (set Surcharge, arc 2) : élargit le PLAFOND de marques
 * que le porteur peut empiler. On le vérifie dans un vrai combat — le nombre de
 * marques n'étant pas exposé, on l'observe via la DÉTONATION, qui n'explose
 * qu'une fois le seuil atteint.
 */
function marker(extra: CombatantInput['abilities'] = []): CombatantInput {
  return {
    id: 'h1',
    name: 'Marqueur',
    role: 'dps',
    hp: 4000,
    atk: 100,
    def: 10,
    speed: 20,
    abilities: [
      // Pose une marque à chaque coup, plafond BAS (2).
      { kind: 'stack_on_hit', mark: 'burn', chance: 1, max: 2 },
      // Explose à 4 : hors d'atteinte tant que le plafond reste à 2.
      { kind: 'detonate', mark: 'burn', threshold: 4, dmgMult: 1 },
      ...extra,
    ],
  };
}

const dummy = (): CombatantInput => ({
  id: 'e1', name: 'Mannequin', role: 'enemy', hp: 100_000, atk: 1, def: 0, speed: 1,
});

const exploded = (seed: number, extra: CombatantInput['abilities'] = []) =>
  resolveCombat({ allies: [marker(extra)], enemies: [dummy()], seed, maxRounds: 20 })
    .events.some((e) => (e as { message?: string }).message?.includes('fait exploser'));

describe('stack_cap_mult — plafond de marques', () => {
  it('SANS le modificateur, le plafond (2) empêche d’atteindre le seuil (4)', () => {
    // Prouve que le test peut échouer : sans ça, le cas « avec » ne prouverait rien.
    expect(exploded(1)).toBe(false);
  });

  it('AVEC ×2, le plafond passe à 4 et la détonation se déclenche', () => {
    expect(exploded(1, [{ kind: 'stack_cap_mult', mult: 2 }])).toBe(true);
  });

  it('les multiplicateurs se COMPOSENT (×2 puis ×2 = ×4, pas ×3)', () => {
    const c = resolveCombat({
      allies: [
        marker([
          { kind: 'stack_cap_mult', mult: 2 },
          { kind: 'stack_cap_mult', mult: 2 },
        ]),
      ],
      enemies: [dummy()],
      seed: 7,
      maxRounds: 20,
    });
    expect(c.events.some((e) => (e as { message?: string }).message?.includes('fait exploser'))).toBe(true);
  });

  it('ne pose AUCUNE marque par lui-même : sans source, il ne fait rien', () => {
    // Un modificateur seul ne doit pas créer de dégâts.
    const solo: CombatantInput = {
      id: 'h1', name: 'Solo', role: 'dps', hp: 4000, atk: 100, def: 10, speed: 20,
      abilities: [
        { kind: 'stack_cap_mult', mult: 2 },
        { kind: 'detonate', mark: 'burn', threshold: 1, dmgMult: 1 },
      ],
    };
    const c = resolveCombat({ allies: [solo], enemies: [dummy()], seed: 3, maxRounds: 20 });
    expect(c.events.some((e) => (e as { message?: string }).message?.includes('fait exploser'))).toBe(false);
  });
});
