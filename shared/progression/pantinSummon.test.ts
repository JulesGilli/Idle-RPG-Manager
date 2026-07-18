import { describe, expect, it } from 'vitest';
import { resolveCombat } from '../combat/resolveCombat.ts';
import { isSummonId } from '../combat/summon.ts';
import { buildPantin, pantinScore, PANTIN_ROUNDS } from './pantin.ts';
import { computeAbilities } from './skills.ts';
import type { CombatantInput } from '../combat/types.ts';

/** Build réel d'un Nécromancien invocateur (celui de Sow). */
const GARRICK = { n_leg_appel: 5, n_leg_furie: 1, n_leg_assaut: 3, n_col_ossature: 1, n_leg_ossuaire: 2 };

function necro(): CombatantInput {
  return {
    id: 'necro', name: 'Nécromancien', role: 'dps', hp: 900, atk: 70, def: 20, speed: 12,
    abilities: computeAbilities('necromancien', GARRICK, {
      activeId: 'n_leg_assaut',
      ultimateId: null,
    }),
  };
}
const fight = (allies: CombatantInput[]) =>
  resolveCombat({ allies, enemies: [buildPantin()], seed: 77, maxRounds: PANTIN_ROUNDS });

describe('Pantin — les invocations participent', () => {
  it('les créatures sont présentes dans le combat', () => {
    const res = fight([necro()]);
    expect(res.finalState.filter((c) => isSummonId(c.id)).length).toBeGreaterThan(0);
  });

  it('elles frappent réellement le pantin', () => {
    const res = fight([necro()]);
    const bySummons = res.events.filter(
      (e) => e.type === 'attack' && isSummonId(e.actorId) && e.targetId === 'pantin',
    );
    expect(bySummons.length).toBeGreaterThan(0);
  });

  it('leurs dégâts COMPTENT dans le score', () => {
    // Le score = PV perdus par le pantin : il doit inclure les coups des squelettes.
    const res = fight([necro()]);
    const total = res.events
      .filter((e) => e.type === 'attack' && e.targetId === 'pantin')
      .reduce((s, e) => s + (e as { damage: number }).damage, 0);
    const bySummons = res.events
      .filter((e) => e.type === 'attack' && isSummonId(e.actorId) && e.targetId === 'pantin')
      .reduce((s, e) => s + (e as { damage: number }).damage, 0);
    expect(pantinScore(res.finalState)).toBe(total);
    expect(bySummons).toBeGreaterThan(0);
    expect(pantinScore(res.finalState)).toBeGreaterThan(total - bySummons);
  });

  it('un invocateur score PLUS qu’un héros identique sans invocations', () => {
    const sans: CombatantInput = { ...necro(), abilities: [] };
    expect(pantinScore(fight([necro()]).finalState)).toBeGreaterThan(
      pantinScore(fight([sans]).finalState),
    );
  });

  it('le pantin ne riposte jamais : les invocations survivent toutes', () => {
    const res = fight([necro()]);
    const summons = res.finalState.filter((c) => isSummonId(c.id));
    expect(summons.every((c) => c.alive)).toBe(true);
  });
});

/**
 * Garde-fou « les invocations marchent PARTOUT ». Les activités diffèrent par la
 * FORME du combat (solo, escouade, pantin increvable) ; on les rejoue toutes ici
 * pour qu'une régression du moteur soit attrapée quelle que soit l'activité.
 */
describe('Invocations — toutes les formes de combat', () => {
  const ennemi = (o: Partial<CombatantInput> = {}): CombatantInput => ({
    id: 'e1', name: 'Ennemi', role: 'enemy', hp: 4000, atk: 40, def: 10, speed: 8, ...o,
  });
  const allié = (i: number): CombatantInput => ({
    id: `a${i}`, name: `Allié ${i}`, role: 'dps', hp: 700, atk: 40, def: 10, speed: 10,
  });
  const summonsOf = (res: ReturnType<typeof resolveCombat>) =>
    res.finalState.filter((c) => isSummonId(c.id));

  it('SOLO (tour, boss d’arc) : les créatures apparaissent', () => {
    const res = resolveCombat({ allies: [necro()], enemies: [ennemi()], seed: 5 });
    expect(summonsOf(res).length).toBeGreaterThan(0);
  });

  it('ESCOUADE (carte, donjon, raid) : elles apparaissent aux côtés des alliés', () => {
    const res = resolveCombat({
      allies: [necro(), allié(1), allié(2), allié(3), allié(4)],
      enemies: [ennemi(), ennemi({ id: 'e2' }), ennemi({ id: 'e3' })],
      seed: 5,
    });
    expect(summonsOf(res).length).toBeGreaterThan(0);
    // Et elles ne prennent la place de personne : les 5 héros sont toujours là.
    expect(res.finalState.filter((c) => c.side === 'ally' && !isSummonId(c.id))).toHaveLength(5);
  });

  it('ARÈNE (héros contre héros) : elles apparaissent des deux côtés', () => {
    const adverse: CombatantInput = { ...necro(), id: 'necro2', name: 'Rival', role: 'enemy' };
    const res = resolveCombat({ allies: [necro()], enemies: [adverse], seed: 5 });
    expect(summonsOf(res).some((c) => c.side === 'ally')).toBe(true);
    expect(summonsOf(res).some((c) => c.side === 'enemy')).toBe(true);
  });

  it('dans TOUTES ces formes, elles infligent réellement des dégâts', () => {
    for (const enemies of [[ennemi()], [ennemi(), ennemi({ id: 'e2' })], [buildPantin()]]) {
      const res = resolveCombat({ allies: [necro()], enemies, seed: 5, maxRounds: PANTIN_ROUNDS });
      const dmg = res.events
        .filter((e) => e.type === 'attack' && isSummonId(e.actorId))
        .reduce((s, e) => s + (e as { damage: number }).damage, 0);
      expect(dmg).toBeGreaterThan(0);
    }
  });
});
