import { describe, expect, it } from 'vitest';
import { buildHeroSnapshot, equipmentPassives, type HeroSnapshotInput } from './heroLoan.ts';
import { GEMS, jewelPct } from './jewelry.ts';
import { divinePassive } from './divine.ts';

import { FORGE_MATERIALS } from './forge.ts';

/**
 * PASSIFS D'ÉQUIPEMENT — un même type ne compte QU'UNE FOIS.
 *
 * Le combat somme les passifs : une arme Divine et un bijou taillés dans la même
 * gemme cumulaient leurs pourcentages, ce qui faisait sauter le plafond de la
 * gemme autant de fois qu'il y a d'emplacements.
 */

function hero(over: Partial<HeroSnapshotInput> = {}): HeroSnapshotInput {
  return {
    id: 'h1',
    name: 'Aldric',
    classId: 'guerrier',
    level: 12,
    classBase: { hp: 130, atk: 10, def: 12, speed: 6 },
    innate: { hp: 5, atk: 2, def: 0, speed: 1 },
    alloc: { hp: 3, atk: 1, def: 0, speed: 0 },
    equipment: { atk: 40, def: 20, hp: 60 },
    jewelPassive: null,
    skills: {},
    ...over,
  };
}

const total = (snap: ReturnType<typeof buildHeroSnapshot>, type: string) =>
  (snap.passives ?? []).filter((p) => p.type === type).reduce((s, p) => s + p.value, 0);

describe('equipmentPassives — le plus fort l’emporte', () => {
  it('deux sources du même type n’en font qu’une, la plus forte', () => {
    const out = equipmentPassives([
      { type: 'lifesteal', value: 0.2 },
      { type: 'lifesteal', value: 0.35 },
    ]);
    expect(out).toEqual([{ type: 'lifesteal', value: 0.35 }]);
  });

  it('l’ordre des emplacements ne change RIEN (pas de « premier arrivé »)', () => {
    const a = equipmentPassives([{ type: 'crit', value: 0.35 }, { type: 'crit', value: 0.1 }]);
    const b = equipmentPassives([{ type: 'crit', value: 0.1 }, { type: 'crit', value: 0.35 }]);
    expect(a).toEqual(b);
  });

  it('des types DIFFÉRENTS coexistent tous', () => {
    const out = equipmentPassives([
      { type: 'crit', value: 0.2 },
      { type: 'lifesteal', value: 0.3 },
      null,
      { type: 'thorns', value: 0.1 },
    ]);
    expect(out).toHaveLength(3);
  });
});

describe('buildHeroSnapshot — quatre emplacements, un seul passif', () => {
  it('arme Divine + bijou + relique + armure de la MÊME gemme = une seule fois', () => {
    const p = { type: 'lifesteal' as const, value: 0.35 };
    const snap = buildHeroSnapshot(
      hero({ weaponPassive: p, jewelPassive: p, relicPassive: p, armorPassive: p }),
    );
    expect(total(snap, 'lifesteal')).toBeCloseTo(0.35);
  });

  it('le bijou le plus faible ne PLOMBE pas l’arme divine', () => {
    const snap = buildHeroSnapshot(
      hero({
        weaponPassive: { type: 'lifesteal', value: 0.35 },
        jewelPassive: { type: 'lifesteal', value: 0.08 },
      }),
    );
    expect(total(snap, 'lifesteal')).toBeCloseTo(0.35);
  });

  it('vaut le PLAFOND de la gemme, jamais son multiple', () => {
    // Cas réel : une gemme de vol de vie, montée en arme Divine ET en bijou.
    const gem = GEMS.find((g) => g.passive === 'lifesteal')!;
    const divine = divinePassive(gem); // % entiers, au plafond
    const jewelPassivePct = jewelPct(FORGE_MATERIALS.at(-1)!, gem, 'ultimate');
    const snap = buildHeroSnapshot(
      hero({
        weaponPassive: { type: divine.type, value: divine.value / 100 },
        jewelPassive: { type: gem.passive, value: jewelPassivePct / 100 },
      }),
    );
    expect(total(snap, 'lifesteal')).toBeCloseTo(gem.maxPct / 100);
  });

  it('les passifs d’ARBRE continuent, eux, de s’ajouter à l’équipement', () => {
    // La règle borne l'ÉQUIPEMENT : l'arbre est un autre axe de progression et
    // n'est pas concerné. Guerrier `g_ber_oeil` (Œil du tueur) accorde du crit.
    const withTree = buildHeroSnapshot(
      hero({ jewelPassive: { type: 'crit', value: 0.2 }, skills: { g_ber_oeil: 3 } }),
    );
    const equipOnly = buildHeroSnapshot(hero({ jewelPassive: { type: 'crit', value: 0.2 } }));
    expect(total(withTree, 'crit')).toBeGreaterThan(total(equipOnly, 'crit'));
  });
});
