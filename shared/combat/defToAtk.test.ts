import { describe, expect, it } from 'vitest';
import { resolveCombat } from './resolveCombat.ts';
import type { CombatantInput } from './types.ts';

/**
 * `def_to_atk` (set Acier Retourné, arc 2) : sacrifie une fraction de la DEF pour la
 * reverser en ATK. Conversion STATIQUE, résolue à la construction du combattant.
 *
 * On l'observe par le COMPORTEMENT (dégâts infligés, dégâts encaissés) et non
 * par les stats : `finalState` n'expose que les PV, et comparer des champs
 * absents ferait passer le test à vide.
 */
const ABIL: CombatantInput['abilities'] = [{ kind: 'def_to_atk', ratio: 0.5 }];

const hero = (abilities: CombatantInput['abilities'] = []): CombatantInput => ({
  id: 'h1', name: 'Rempart', role: 'tank', hp: 100_000, atk: 100, def: 400, speed: 10, abilities,
});

/** Sac de frappe inoffensif : mesure les dégâts INFLIGÉS par le héros. */
const punchingBag = (): CombatantInput => ({
  id: 'e1', name: 'Mannequin', role: 'enemy', hp: 1_000_000, atk: 0, def: 0, speed: 1,
});

/** Cogneur : mesure les dégâts ENCAISSÉS par le héros. */
const bruiser = (): CombatantInput => ({
  id: 'e1', name: 'Cogneur', role: 'enemy', hp: 1_000_000, atk: 900, def: 0, speed: 30,
});

function fight(abilities: CombatantInput['abilities'], enemy: CombatantInput) {
  const c = resolveCombat({ allies: [hero(abilities)], enemies: [enemy], seed: 5, maxRounds: 12 });
  const me = c.finalState.find((f) => f.id === 'h1')!;
  const foe = c.finalState.find((f) => f.id === 'e1')!;
  // Les PV ennemis sont multiplies par MONSTER_HP_SCALE : on ne reconstruit
  // aucun total, on compare les PV RESTANTS entre deux runs.
  return { foeHpLeft: foe.hp, taken: 100_000 - me.hp };
}

describe('def_to_atk — conversion armure → attaque', () => {
  it('augmente les dégâts INFLIGÉS (l’ATK a bien monté)', () => {
    const sans = fight([], punchingBag()).foeHpLeft;
    const avec = fight(ABIL, punchingBag()).foeHpLeft;
    // Reference : un heros qui ne frappe pas laisse le mannequin intact. Sans
    // ce point de comparaison, un test ou PERSONNE ne frappe passerait aussi.
    const intact = resolveCombat({
      allies: [{ ...hero(), atk: 0 }],
      enemies: [punchingBag()],
      seed: 5,
      maxRounds: 12,
    }).finalState.find((f) => f.id === 'e1')!.hp;
    expect(sans).toBeLessThan(intact);
    expect(avec).toBeLessThan(sans);
  });

  it('augmente les dégâts ENCAISSÉS (la DEF a bien baissé) — c’est le COÛT', () => {
    const sans = fight([], bruiser()).taken;
    const avec = fight(ABIL, bruiser()).taken;
    expect(sans).toBeGreaterThan(0);
    expect(avec).toBeGreaterThan(sans);
  });

  it('sans l’abilité, le combat est stricitement identique', () => {
    expect(fight([], punchingBag())).toEqual(fight(undefined, punchingBag()));
  });

  it('au-delà de 100 %, la conversion est bornée (pas de DEF négative)', () => {
    // Une DEF négative rendrait le porteur invincible ou le tuerait selon le
    // signe — le garde-fou est ce qui empêche l'effet de partir en vrille.
    const borne = fight([{ kind: 'def_to_atk', ratio: 5 }], punchingBag()).foeHpLeft;
    const total = fight([{ kind: 'def_to_atk', ratio: 1 }], punchingBag()).foeHpLeft;
    expect(borne).toBe(total);
  });
});
