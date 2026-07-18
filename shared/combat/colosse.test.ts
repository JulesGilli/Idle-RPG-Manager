import { describe, expect, it } from 'vitest';
import { resolveCombat } from './resolveCombat.ts';
import type { Ability, CombatantInput } from './types.ts';
import { allNodes, describeNodeEffects } from '../progression/skills.ts';

const CREATURE = 'Créature mortuaire';
/** Rituel quasi immédiat : 1 stack d'os suffit à dresser la créature. */
const RITUAL: Ability = { kind: 'bone_ritual', threshold: 1, hpMult: 1, atkMult: 1, name: CREATURE };
const STACKS: Ability = { kind: 'bone_stack', chance: 1 };

function necro(extra: Ability[]): CombatantInput {
  return {
    id: 'necro', name: 'Nécromancien', role: 'dps', hp: 20000, atk: 100, def: 20, speed: 20,
    abilities: [STACKS, RITUAL, ...extra],
  };
}
const foe = (o: Partial<CombatantInput> = {}): CombatantInput => ({
  id: 'e1', name: 'Ennemi', role: 'enemy', hp: 60000, atk: 30, def: 5, speed: 5, ...o,
});

describe('Charnier — plus besoin de cadavre', () => {
  const charnier: Ability = {
    kind: 'autocast', everyRounds: 4,
    action: { type: 'creature_aoe', dmgMult: 2, creatureName: CREATURE },
  };

  it('se déclenche alors que PERSONNE n’est mort', () => {
    // Aucun combattant ne meurt : l'ancienne version restait muette.
    const res = resolveCombat({ allies: [necro([charnier])], enemies: [foe()], seed: 3 });
    expect(res.events.some((e) => e.type === 'death')).toBe(false);
    expect(res.events.some((e) => e.type === 'status' && e.message.includes('déchaîne'))).toBe(true);
  });

  it('frappe TOUS les ennemis', () => {
    const res = resolveCombat({
      allies: [necro([charnier])],
      enemies: [foe(), foe({ id: 'e2', name: 'Ennemi 2' })],
      seed: 3,
    });
    const hit = (id: string) =>
      res.events.some((e) => e.type === 'attack' && e.targetId === id && e.message.includes("l'ossuaire"));
    expect(hit('e1')).toBe(true);
    expect(hit('e2')).toBe(true);
  });

  it('les dégâts suivent l’ATK de la CRÉATURE, pas celle du nécromancien', () => {
    // atkMult du rituel double → créature deux fois plus forte, coup deux fois plus fort.
    const burst = (atkMult: number) => {
      const ritual: Ability = { kind: 'bone_ritual', threshold: 1, hpMult: 1, atkMult, name: CREATURE };
      const hero: CombatantInput = {
        id: 'necro', name: 'Nécro', role: 'dps', hp: 20000, atk: 100, def: 20, speed: 20,
        abilities: [STACKS, ritual, charnier],
      };
      const res = resolveCombat({ allies: [hero], enemies: [foe()], seed: 3 });
      const first = res.events.find((e) => e.type === 'attack' && e.message.includes("l'ossuaire"));
      return first ? (first as { damage: number }).damage : 0;
    };
    expect(burst(2)).toBeGreaterThan(burst(1));
  });
});

describe('Communion d’os — délai après l’invocation', () => {
  const communion = (delayRounds?: number): Ability => ({
    kind: 'autocast', everyRounds: 2,
    action: delayRounds === undefined
      ? { type: 'sacrifice_transfer', pct: 1, creatureName: CREATURE }
      : { type: 'sacrifice_transfer', pct: 1, creatureName: CREATURE, delayRounds },
  });
  const sacrificeRound = (a: Ability): number | null => {
    const res = resolveCombat({ allies: [necro([a])], enemies: [foe()], seed: 3 });
    const ritual = res.events.find((e) => e.type === 'status' && e.message.includes('se dresse'));
    const sac = res.events.find((e) => e.type === 'status' && e.message.includes('se fond dans'));
    if (!ritual || !sac) return null;
    return sac.round - ritual.round;
  };

  it('attend bien 12 manches après l’invocation', () => {
    const delta = sacrificeRound(communion(12));
    expect(delta).not.toBeNull();
    expect(delta!).toBeGreaterThanOrEqual(12);
  });

  it('sans délai, elle part beaucoup plus tôt (le garde vient bien du champ)', () => {
    const avecDelai = sacrificeRound(communion(12));
    const sansDelai = sacrificeRound(communion());
    expect(sansDelai!).toBeLessThan(avecDelai!);
  });
});

describe('Colosse — descriptions', () => {
  const node = (id: string) => allNodes('necromancien').find((n) => n.id === id)!;

  it('le Charnier ne parle plus de cadavre', () => {
    const txt = describeNodeEffects(node('n_col_charnier'), 1)[0]!;
    expect(txt).not.toContain('cadavre');
    expect(txt).toContain('200 %');
  });

  it('la Communion annonce son délai', () => {
    expect(describeNodeEffects(node('n_col_communion'), 1)[0]).toContain('12 tours');
  });
});
