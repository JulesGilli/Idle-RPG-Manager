import { describe, expect, it } from 'vitest';
import { resolveCombat } from './resolveCombat.ts';
import type { CombatantInput } from './types.ts';

/**
 * `blood_pact` (set Pacte de Sang, arc 2) : les dégâts montent avec les PV
 * manquants, et le porteur paie une fraction de ce qu'il inflige.
 *
 * Observé par le COMPORTEMENT (PV restants de part et d'autre) : `finalState`
 * n'expose que les PV — comparer des stats absentes ferait passer le test à vide.
 */
const PACT: CombatantInput['abilities'] = [
  { kind: 'blood_pact', ampPerMissing: 1, selfRatio: 0.15 },
];

const hero = (
  abilities: CombatantInput['abilities'] = [],
  startHp?: number,
): CombatantInput => ({
  id: 'h1', name: 'Pactisant', role: 'dps', hp: 10_000, atk: 500, def: 0, speed: 20,
  ...(startHp !== undefined ? { startHp } : {}),
  abilities,
});

const bag = (): CombatantInput => ({
  id: 'e1', name: 'Mannequin', role: 'enemy', hp: 5_000_000, atk: 0, def: 0, speed: 1,
});

function run(abilities: CombatantInput['abilities'], startHp?: number, maxRounds = 10) {
  const c = resolveCombat({
    allies: [hero(abilities, startHp)],
    enemies: [bag()],
    seed: 11,
    maxRounds,
  });
  return {
    foeHp: c.finalState.find((f) => f.id === 'e1')!.hp,
    myHp: c.finalState.find((f) => f.id === 'h1')!.hp,
  };
}

describe('blood_pact — plus tu saignes, plus tu frappes', () => {
  it('à PV PLEINS, l’amplification est nulle : seuls les auto-dégâts jouent', () => {
    // Sur UN SEUL tour : au moment de frapper le porteur est encore intact, donc
    // l'amplification vaut 0. Au-dela il s'est deja blesse lui-meme et le
    // pacte s'amorce — c'est la boucle voulue, pas une egalite a tester.
    expect(run(PACT, undefined, 1).foeHp).toBe(run([], undefined, 1).foeHp);
  });

  it('à MI-VIE, le porteur frappe nettement plus fort', () => {
    const sain = run(PACT, 10_000).foeHp;
    const blesse = run(PACT, 5_000).foeHp;
    expect(blesse).toBeLessThan(sain); // moins de PV restants = plus de dégâts
  });

  it('sans le pacte, être blessé ne change RIEN aux dégâts', () => {
    // Prouve que c'est bien le pacte qui agit, et non un effet du moteur lié aux PV.
    expect(run([], 5_000).foeHp).toBe(run([], 10_000).foeHp);
  });

  it('le porteur paie ses coups (auto-dégâts)', () => {
    expect(run(PACT).myHp).toBeLessThan(run([]).myHp);
  });

  it('les auto-dégâts ne peuvent JAMAIS tuer le porteur (plancher à 1 PV)', () => {
    // Le mannequin frappe EN PREMIER (vitesse 30 contre 1), puis le porteur
    // attaque et paie un coût absurde. Sans le plancher il tomberait à 0 ; avec,
    // il finit le tour à 1 PV. Ordre voulu : sinon c'est le mannequin qui
    // l'achève APRÈS le plancher, et le test mesurerait autre chose.
    const c = resolveCombat({
      allies: [
        {
          id: 'h1', name: 'Pactisant', role: 'dps', hp: 10_000, atk: 500, def: 0, speed: 1,
          abilities: [{ kind: 'blood_pact', ampPerMissing: 1, selfRatio: 50 }],
        },
      ],
      enemies: [{ id: 'e1', name: 'Mannequin', role: 'enemy', hp: 5_000_000, atk: 0, def: 0, speed: 30 }],
      seed: 11,
      maxRounds: 1,
    });
    const me = c.finalState.find((f) => f.id === 'h1')!;
    expect(me.hp).toBe(1);
    expect(me.alive).toBe(true);
  });
});
