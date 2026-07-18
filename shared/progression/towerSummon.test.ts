import { describe, expect, it } from 'vitest';
import { simulateTowerClimb } from './tower.ts';
import { computeAbilities } from './skills.ts';
import { isSummonId } from '../combat/summon.ts';
import type { CombatantInput } from '../combat/types.ts';

/**
 * La Tour est un combat SOLO (1v1). `tower.test.ts` n'utilise que des héros sans
 * compétences : rien ne couvrait donc les invocations dans ce contexte. Ces tests
 * rejouent le build réel d'un Nécromancien (Appel rang 5 + Assaut équipé) dans une
 * vraie montée, pour verrouiller le fait que ses créatures combattent bien en tour.
 */
function necromancer(skills: Record<string, number>, activeId?: string): CombatantInput {
  return {
    id: 'necro',
    name: 'Nécromancien',
    role: 'dps',
    hp: 900,
    atk: 70,
    def: 20,
    speed: 12,
    abilities: computeAbilities('necromancien', skills, {
      activeId: activeId ?? null,
      ultimateId: null,
    }),
  };
}

/** Build exact de Garrick (niv. 14) au moment du signalement. */
const GARRICK_SKILLS = {
  n_leg_appel: 5,
  n_leg_furie: 1,
  n_leg_assaut: 3,
  n_col_ossature: 1,
  n_leg_ossuaire: 2,
};

describe('Invocations dans la Tour (combat solo)', () => {
  it('les créatures sont bien présentes dans le combat', () => {
    const run = simulateTowerClimb(1234, necromancer(GARRICK_SKILLS, 'n_leg_assaut'), 1);
    const first = run.fightResults[0]!;
    const summons = first.combat.finalState.filter((c) => isSummonId(c.id));
    expect(summons.length).toBeGreaterThan(0);
  });

  it('Appel rang 5 invoque 3 créatures', () => {
    const run = simulateTowerClimb(1234, necromancer(GARRICK_SKILLS, 'n_leg_assaut'), 1);
    const summons = run.fightResults[0]!.combat.finalState.filter((c) => isSummonId(c.id));
    expect(summons).toHaveLength(3);
  });

  it('les créatures attaquent réellement (elles ne font pas de la figuration)', () => {
    const run = simulateTowerClimb(1234, necromancer(GARRICK_SKILLS, 'n_leg_assaut'), 1);
    const summonAttacks = run.fightResults[0]!.combat.events.filter(
      (e) => e.type === 'attack' && isSummonId(e.actorId),
    );
    expect(summonAttacks.length).toBeGreaterThan(0);
  });

  it('les invocations sont rejouées à CHAQUE étage, pas seulement au premier', () => {
    const run = simulateTowerClimb(1234, necromancer(GARRICK_SKILLS, 'n_leg_assaut'), 1);
    expect(run.fightResults.length).toBeGreaterThan(1);
    for (const fight of run.fightResults) {
      const summons = fight.combat.finalState.filter((c) => isSummonId(c.id));
      expect(summons.length).toBeGreaterThan(0);
    }
  });

  it('un Nécromancien SANS invocation n’en a évidemment aucune', () => {
    const run = simulateTowerClimb(1234, necromancer({ n_col_moelle: 1 }), 1);
    const summons = run.fightResults[0]!.combat.finalState.filter((c) => isSummonId(c.id));
    expect(summons).toHaveLength(0);
  });

  it('les invocations font gagner des étages en plus (impact réel)', () => {
    const withSummons = simulateTowerClimb(1234, necromancer(GARRICK_SKILLS, 'n_leg_assaut'), 1);
    const without = simulateTowerClimb(1234, necromancer({}), 1);
    expect(withSummons.reachedFloor).toBeGreaterThan(without.reachedFloor);
  });
});
