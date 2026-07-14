import { describe, expect, it } from 'vitest';
import { resolveCombat } from './resolveCombat.ts';
import type { CombatantInput } from './types.ts';

function ally(overrides: Partial<CombatantInput> = {}): CombatantInput {
  return { id: 'a1', name: 'Allié', role: 'dps', hp: 300, atk: 40, def: 5, speed: 20, ...overrides };
}
function foe(overrides: Partial<CombatantInput> = {}): CombatantInput {
  return { id: 'e1', name: 'Ennemi', role: 'enemy', hp: 100, atk: 30, def: 5, speed: 10, ...overrides };
}

describe('explode_on_death', () => {
  it('déclenche des dégâts de zone quand la créature meurt', () => {
    // Une créature fragile qui explose fort en mourant, aux côtés d'un allié costaud.
    const bomb = ally({ id: 'bomb', name: 'Squelette', hp: 1, atk: 50, speed: 5, abilities: [{ kind: 'explode_on_death', dmgMult: 5 }] });
    const tank = ally({ id: 'tank', name: 'Tank', hp: 5000, atk: 30 });
    const res = resolveCombat({ allies: [bomb, tank], enemies: [foe({ hp: 400 })], seed: 1 });
    const exploded = res.events.some((e) => e.type === 'status' && e.message.includes('explose'));
    const explosionHit = res.events.some((e) => e.type === 'attack' && e.message.includes("L'explosion"));
    expect(exploded).toBe(true);
    expect(explosionHit).toBe(true);
  });
});

describe('drain_aura', () => {
  it("soigne un allié blessé avec une part des dégâts infligés", () => {
    const drainer = ally({ id: 'drain', name: 'Hémomancien', atk: 60, abilities: [{ kind: 'drain_aura', pct: 0.5 }] });
    const wounded = ally({ id: 'w', name: 'Blessé', hp: 500, startHp: 100, atk: 10, speed: 1 });
    const res = resolveCombat({ allies: [drainer, wounded], enemies: [foe({ hp: 2000, atk: 1 })], seed: 3 });
    const drainHeal = res.events.some((e) => e.type === 'heal' && e.message.includes('draine la vie vers'));
    expect(drainHeal).toBe(true);
  });
});

describe('purge (on_hit) & amp_vs_buff', () => {
  it('dissipe un bienfait de la cible et amplifie contre les cibles buffées', () => {
    // L'ennemi se buffe (autocast buff self) ; l'allié purge à chaque coup.
    const purger = ally({
      id: 'inq',
      name: 'Inquisiteur',
      atk: 50,
      abilities: [
        { kind: 'purge', chance: 1 },
        { kind: 'amp_vs_buff', bonus: 0.5 },
      ],
    });
    const buffedFoe = foe({
      hp: 3000,
      atk: 5,
      speed: 30, // agit avant → se buffe tôt
      abilities: [{ kind: 'autocast', everyRounds: 2, action: { type: 'buff', scope: 'self', duration: 5, atk: 0.5 } }],
    });
    const res = resolveCombat({ allies: [purger], enemies: [buffedFoe], seed: 7 });
    const purged = res.events.some((e) => e.type === 'status' && e.message.includes('dissipe un bienfait'));
    expect(purged).toBe(true);
  });
});

describe('autocast purge', () => {
  it('retire les bienfaits de la cible et inflige des dégâts', () => {
    const judge = ally({
      id: 'verdict',
      name: 'Juge',
      atk: 50,
      speed: 5,
      abilities: [{ kind: 'autocast', everyRounds: 2, action: { type: 'purge', count: 99, dmgMult: 1, perPurgedDmg: 0.6 } }],
    });
    const buffedFoe = foe({
      hp: 4000,
      atk: 5,
      speed: 30,
      abilities: [{ kind: 'autocast', everyRounds: 2, action: { type: 'buff', scope: 'self', duration: 6, atk: 0.5 } }],
    });
    const res = resolveCombat({ allies: [judge], enemies: [buffedFoe], seed: 11 });
    const sentence = res.events.some((e) => e.type === 'status' && e.message.includes('prononce sa sentence'));
    const chastise = res.events.some((e) => e.type === 'attack' && e.message.includes('châtie'));
    expect(sentence).toBe(true);
    expect(chastise).toBe(true);
  });
});
