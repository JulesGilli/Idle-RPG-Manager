import { describe, expect, it } from 'vitest';
import { resolveCombat } from './resolveCombat.ts';
import type { Ability, CombatantInput } from './types.ts';

/**
 * AMPLIFICATION PAR MARQUE (`amp_per_stack`) — Combustion et Embrasement
 * (« tes dégâts augmentent par stack d'embrasement sur la cible »), Marque
 * arcanique (« +dégâts par stack »).
 *
 * Le moteur ne l'appliquait QUE dans l'attaque de base : elle ne comptait donc
 * pas sur les compétences et les ultimes de ces mêmes classes — c'est-à-dire
 * sur leurs plus gros coups, et sur l'unique raison d'empiler des marques. Même
 * oubli que celui déjà corrigé pour `hp_strike` (le Colosse perdait son bonus
 * sur ses actifs).
 */

const AMP: Ability = { kind: 'amp_per_stack', mark: 'burn', bonus: 0.5 };

/** Un actif qui frappe fort, sans poser lui-même de marque. */
const NUKE: Ability = {
  kind: 'autocast',
  everyRounds: 2,
  action: { type: 'aoe', dmgMult: 3 },
};

function mage(abilities: Ability[]): CombatantInput {
  return {
    id: 'mage',
    name: 'Mage',
    role: 'dps',
    hp: 100_000,
    atk: 1000,
    def: 500,
    speed: 30,
    abilities,
  };
}

const cible: CombatantInput = {
  id: 'e1',
  name: 'Cible',
  role: 'enemy',
  hp: 400_000,
  atk: 10,
  def: 0,
  speed: 1,
};

/**
 * Dégâts infligés par le SEUL actif (message « embrase »), à l'exclusion des
 * attaques de base.
 *
 * L'isolement est indispensable : `amp_per_stack` s'appliquait DÉJÀ aux coups
 * de base. Mesurer les dégâts totaux ne prouverait donc rien sur les
 * compétences — un total plus élevé viendrait des coups de base.
 */
function skillDamage(abilities: Ability[]): number {
  const res = resolveCombat({ allies: [mage(abilities)], enemies: [cible], seed: 11, maxRounds: 12 });
  return res.events
    .filter((e) => e.type === 'attack' && e.actorId === 'mage' && e.message.includes('embrase'))
    .reduce((sum, e) => sum + ((e as { damage: number }).damage ?? 0), 0);
}
describe('amp_per_stack sur les COMPÉTENCES', () => {
  it('empiler des marques augmente les dégâts des sorts, pas seulement des coups de base', () => {
    // Les frappes de base posent une MARQUE à chaque coup ; l'actif, lui, n'en
    // pose aucune. Sans l'amplification sur les compétences, les deux combats
    // rendraient exactement les mêmes dégâts.
    //
    // On empile bien `stack_on_hit` et NON le statut « brûlure » :
    // `amp_per_stack` lit `target.stacks[mark]`, un compteur de marques distinct
    // des afflictions. Les confondre, c'est tester à côté — mon premier jet le
    // faisait, et il sortait « à égalité » sans rien prouver.
    const marques: Ability = { kind: 'stack_on_hit', mark: 'burn', chance: 1, max: 99 };
    const avec = skillDamage([marques, NUKE, AMP]);
    const sans = skillDamage([marques, NUKE]);
    expect(avec).toBeGreaterThan(sans);
  });

  it('sans marque sur la cible, l’amplification ne change rien', () => {
    // Garde-fou : le bonus doit venir des STACKS, pas d'un multiplicateur gratuit
    // accordé à quiconque porte la capacité.
    expect(skillDamage([NUKE, AMP])).toBe(skillDamage([NUKE]));
  });
});
