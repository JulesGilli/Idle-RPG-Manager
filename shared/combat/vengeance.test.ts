import { describe, expect, it } from 'vitest';
import { resolveCombat } from './resolveCombat.ts';
import type { CombatantInput } from './types.ts';

/**
 * `vengeance` (set Sentinelle, arc 2) : renvoie périodiquement ce que le porteur
 * a encaissé sur les dernières manches. Récompense le fait d'ÊTRE CIBLÉ.
 */
const VENG: CombatantInput['abilities'] = [
  { kind: 'vengeance', windowRounds: 2, everyRounds: 4, ratio: 1 },
];

const tank = (abilities: CombatantInput['abilities'] = []): CombatantInput => ({
  id: 'h1', name: 'Sentinelle', role: 'tank', hp: 500_000, atk: 10, def: 0, speed: 5, abilities,
});
/** Cogne fort : c'est ce qu'il inflige qui alimente la riposte. */
const cogneur = (atk: number): CombatantInput => ({
  id: 'e1', name: 'Cogneur', role: 'enemy', hp: 9_000_000, atk, def: 0, speed: 30,
});

function run(abilities: CombatantInput['abilities'], atk = 2000, rounds = 12) {
  const c = resolveCombat({
    allies: [tank(abilities)],
    enemies: [cogneur(atk)],
    seed: 9,
    maxRounds: rounds,
  });
  return {
    foeHp: c.finalState.find((f) => f.id === 'e1')!.hp,
    renvois: c.events.filter((e) => (e as { message?: string }).message?.includes('rend les coups')).length,
  };
}

describe('vengeance — la Sentinelle rend les coups', () => {
  it('renvoie des dégâts, ce que le témoin sans l’abilité ne fait pas', () => {
    expect(run([]).renvois).toBe(0);
    expect(run(VENG).renvois).toBeGreaterThan(0);
    expect(run(VENG).foeHp).toBeLessThan(run([]).foeHp);
  });

  it('respecte le COOLDOWN : pas plus d’une riposte tous les 4 tours', () => {
    // 12 manches → 3 ripostes au maximum. Sans cooldown il y en aurait ~12.
    expect(run(VENG, 2000, 12).renvois).toBeLessThanOrEqual(3);
  });

  it('renvoie PLUS quand le porteur encaisse plus', () => {
    // C'est la promesse du set : la riposte est proportionnelle à l'encaissé.
    const faible = run(VENG, 500).foeHp;
    const fort = run(VENG, 5000).foeHp;
    expect(fort).toBeLessThan(faible);
  });

  it('la riposte vaut CE QUI A ETE ENCAISSE, pas un montant fixe', () => {
    // Il n'existe pas de scenario "jamais touche" : le moteur impose 1 degat
    // minimum, meme a ATK 0. On verifie donc que face a un ennemi inoffensif la
    // riposte est DERISOIRE, la ou elle est massive face a un cogneur.
    const lire = (atk: number) => {
      const c = resolveCombat({
        allies: [tank(VENG)],
        enemies: [{ id: 'e1', name: 'Adversaire', role: 'enemy', hp: 9_000_000, atk, def: 0, speed: 30 }],
        seed: 9,
        maxRounds: 6,
      });
      const ev = c.events.find((e) => (e as { message?: string }).message?.includes('rend les coups'));
      return (ev as { damage?: number } | undefined)?.damage ?? 0;
    };
    expect(lire(0)).toBeLessThan(20);
    expect(lire(3000)).toBeGreaterThan(1000);
  });
});
