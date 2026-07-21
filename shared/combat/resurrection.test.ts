import { describe, expect, it } from 'vitest';
import { resolveCombat } from './resolveCombat.ts';
import type { Ability, CombatantInput } from './types.ts';
import { computeAbilities } from '../progression/skills.ts';

/**
 * RÉSURRECTION PARTIELLE (ultime du Soigneur).
 *
 * Elle ne ressuscitait que son propre porteur, alors qu'elle promet « ramène un
 * allié tombé » — et comme un soigneur meurt en dernier, elle ne se déclenchait
 * quasiment jamais. Ces tests figent le comportement attendu.
 */

const REVIVE: Ability = { kind: 'revive', hpPct: 0.3 };

/** Soigneur très résistant : il doit SURVIVRE pour pouvoir relever quelqu'un. */
const soigneur = (abilities: Ability[] = [REVIVE]): CombatantInput => ({
  id: 'heal',
  name: 'Soigneur',
  role: 'dps', // rôle 'dps' : un 'healer' passerait son tour à soigner, hors sujet ici
  hp: 400_000,
  atk: 5,
  def: 900,
  speed: 30,
  abilities,
});

/** Allié à 1 PV : il tombe au premier coup reçu. */
const fragile = (id = 'ally'): CombatantInput => ({
  id,
  name: `Allié ${id}`,
  role: 'dps',
  hp: 1,
  atk: 5,
  def: 0,
  speed: 5,
});

const brute: CombatantInput = {
  id: 'e1',
  name: 'Brute',
  role: 'enemy',
  hp: 400_000,
  atk: 900,
  def: 5,
  speed: 20,
};

/** L'événement de résurrection porte un message dédié. */
type HealEvent = Extract<ReturnType<typeof resolveCombat>['events'][number], { type: 'heal' }>;
const revives = (res: ReturnType<typeof resolveCombat>): HealEvent[] =>
  res.events.filter((e): e is HealEvent => e.type === 'heal' && e.message.includes('ramène'));

describe('Résurrection partielle — relève un ALLIÉ', () => {
  it('un allié tombé est ramené par le porteur', () => {
    const res = resolveCombat({
      allies: [soigneur(), fragile()],
      enemies: [brute],
      seed: 3,
      maxRounds: 20,
    });
    const r = revives(res);
    expect(r.length).toBeGreaterThan(0);
    expect(r[0]!.targetId).toBe('ally');
    expect(r[0]!.actorId).toBe('heal');
  });

  it('sans la compétence, l’allié reste mort (le test ne passe pas tout seul)', () => {
    const res = resolveCombat({
      allies: [soigneur([]), fragile()],
      enemies: [brute],
      seed: 3,
      maxRounds: 20,
    });
    expect(revives(res)).toHaveLength(0);
    expect(res.events.some((e) => e.type === 'death' && e.combatantId === 'ally')).toBe(true);
  });

  it('ramène bien à la FRACTION de PV annoncée', () => {
    const gros = { ...fragile('ally'), hp: 1000 };
    const res = resolveCombat({
      allies: [soigneur(), gros],
      enemies: [brute],
      seed: 3,
      maxRounds: 20,
    });
    // 30 % de 1000 PV… mais le moteur ne scale QUE les ennemis : l'allié garde
    // ses PV d'entrée. On lit donc le maxHp final pour rester exact.
    const target = res.finalState.find((c) => c.id === 'ally')!;
    expect(revives(res)[0]!.amount).toBe(Math.round(target.maxHp * 0.3));
  });

  it('une seule fois par combat, même avec plusieurs morts', () => {
    const res = resolveCombat({
      allies: [soigneur(), fragile('a1'), fragile('a2'), fragile('a3')],
      enemies: [brute],
      seed: 5,
      maxRounds: 30,
    });
    expect(revives(res)).toHaveLength(1);
  });

  it('deux porteurs = deux résurrections (la charge est PAR porteur)', () => {
    const second = { ...soigneur(), id: 'heal2', name: 'Soigneur 2' };
    const res = resolveCombat({
      allies: [soigneur(), second, fragile('a1'), fragile('a2')],
      enemies: [brute],
      seed: 5,
      maxRounds: 30,
    });
    expect(revives(res)).toHaveLength(2);
  });
});

describe('Résurrection partielle — ce qu’elle ne doit PAS faire', () => {
  it('ne se gaspille pas sur une INVOCATION qui tombe', () => {
    // Un nécromancien perd ses squelettes en boucle : la charge unique doit
    // rester pour un vrai héros, pas partir sur le premier squelette.
    const necro: CombatantInput = {
      id: 'necro',
      name: 'Nécro',
      role: 'dps',
      hp: 400_000,
      atk: 5,
      def: 900,
      speed: 25,
      abilities: [
        {
          kind: 'summon',
          count: 1,
          hpMult: 0.0001,
          atkMult: 0.01,
          defMult: 0.01,
          summonName: 'Squelette',
        },
      ],
    };
    const res = resolveCombat({
      allies: [soigneur(), necro, fragile()],
      enemies: [brute],
      seed: 7,
      maxRounds: 30,
    });
    for (const r of revives(res)) {
      expect(r.targetId, 'une invocation a consommé la résurrection').not.toContain('~summon~');
    }
  });

  it('ne ressuscite JAMAIS un ennemi', () => {
    const ennemiFragile: CombatantInput = { ...brute, id: 'e1', hp: 1, atk: 900 };
    const res = resolveCombat({
      allies: [soigneur(), fragile()],
      enemies: [ennemiFragile],
      seed: 3,
      maxRounds: 20,
    });
    for (const r of revives(res)) expect(r.targetId).not.toBe('e1');
  });
});

describe('Résurrection partielle — câblage dans l’arbre', () => {
  it('l’ultime du Soigneur produit bien la capacité', () => {
    const built = computeAbilities(
      'soigneur',
      { s_lum_resurrection: 1 },
      { activeId: null, ultimateId: 's_lum_resurrection' },
    );
    const revive = built.find((a) => a.kind === 'revive');
    expect(revive, 'la capacité est jetée avant d’atteindre le combat').toBeDefined();
    expect((revive as { hpPct: number }).hpPct).toBeCloseTo(0.3);
  });
});
