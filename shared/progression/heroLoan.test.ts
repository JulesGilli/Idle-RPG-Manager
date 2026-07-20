import { describe, expect, it } from 'vitest';
import { buildHeroSnapshot, isHeroAvailableForLoan, type HeroSnapshotInput } from './heroLoan.ts';
import { effectiveStats } from './formulas.ts';
import { computeAbilities, computePassives, combatRole, classHealMult } from './skills.ts';
import { classDamageBase } from './damageTypes.ts';
import { resolveCombat } from '../combat/resolveCombat.ts';

function sampleHero(over: Partial<HeroSnapshotInput> = {}): HeroSnapshotInput {
  return {
    id: 'h1',
    name: 'Aldric',
    classId: 'guerrier',
    level: 12,
    classBase: { hp: 130, atk: 10, def: 12, speed: 6 },
    innate: { hp: 5, atk: 2, def: 0, speed: 1 },
    alloc: { hp: 3, atk: 1, def: 0, speed: 0 },
    equipment: { atk: 40, def: 20, hp: 60 },
    jewelPassive: { type: 'thorns', value: 0.12 },
    skills: { g_penetration: 2, g_rage: 1 },
    ...over,
  };
}

describe('buildHeroSnapshot', () => {
  it('produit un CombatantInput complet (mêmes champs que le build normal)', () => {
    const snap = buildHeroSnapshot(sampleHero());
    expect(snap).toMatchObject({
      id: 'h1',
      name: 'Aldric',
      role: 'tank', // guerrier
    });
    for (const k of ['hp', 'atk', 'def', 'speed'] as const) {
      expect(typeof snap[k]).toBe('number');
      expect(snap[k]).toBeGreaterThan(0);
    }
    expect(Array.isArray(snap.passives)).toBe(true);
    expect(Array.isArray(snap.abilities)).toBe(true);
  });

  it('reproduit EXACTEMENT la formule de build d’un héros normal (chemin unique)', () => {
    const h = sampleHero();
    const snap = buildHeroSnapshot(h);

    // Réplique de la logique `buildAllies` des Edge Functions.
    const stats = effectiveStats(
      {
        hp: Math.max(1, h.classBase.hp + h.innate.hp),
        atk: Math.max(1, h.classBase.atk + h.innate.atk),
        def: Math.max(0, h.classBase.def + h.innate.def),
        speed: Math.max(1, h.classBase.speed + h.innate.speed),
      },
      h.level,
      { atk: h.equipment.atk, def: h.equipment.def, hp: h.equipment.hp },
      { hp: h.alloc.hp, atk: h.alloc.atk, def: h.alloc.def, speed: h.alloc.speed },
    );
    const expected = {
      id: h.id,
      name: h.name,
      role: combatRole(h.classId),
      basicType: classDamageBase(h.classId),
      // Équilibrage des soins par classe : le snapshot le transporte jusqu'au
      // moteur, qui ne connaît pas les classes.
      healMult: classHealMult(h.classId),
      ...stats,
      passives: [
        { type: 'thorns', value: 0.12 },
        ...computePassives(h.classId, h.skills),
      ],
      abilities: computeAbilities(h.classId, h.skills),
    };
    expect(snap).toEqual(expected);
  });

  it('déterministe : mêmes ingrédients → même snapshot', () => {
    expect(buildHeroSnapshot(sampleHero())).toEqual(buildHeroSnapshot(sampleHero()));
  });

  it('inclut le passif du bijou, et l’omet quand il n’y en a pas', () => {
    const withJewel = buildHeroSnapshot(sampleHero({ jewelPassive: { type: 'crit', value: 0.2 } }));
    expect(withJewel.passives).toContainEqual({ type: 'crit', value: 0.2 });

    const without = buildHeroSnapshot(sampleHero({ jewelPassive: null, skills: {} }));
    expect(without.passives).toEqual([]);
  });

  it('le snapshot est directement consommable par le moteur de combat', () => {
    const ally = buildHeroSnapshot(sampleHero());
    const enemy = { id: 'e0', name: 'Gobelin', role: 'enemy' as const, hp: 50, atk: 8, def: 2, speed: 5 };
    const combat = resolveCombat({ allies: [ally], enemies: [enemy], seed: 123 });
    expect(combat.result).toBe('win');
    expect(combat.finalState.find((f) => f.id === 'h1')).toBeDefined();
  });
});

describe('isHeroAvailableForLoan', () => {
  it('empruntable si le héros n’est engagé dans aucune activité', () => {
    expect(isHeroAvailableForLoan('h1', ['h2', 'h3'])).toBe(true);
  });
  it('non empruntable si le héros est déjà engagé chez son propriétaire', () => {
    expect(isHeroAvailableForLoan('h1', ['h1', 'h2'])).toBe(false);
  });
});
