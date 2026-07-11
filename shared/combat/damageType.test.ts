import { describe, expect, it } from 'vitest';
import { resolveCombat } from './resolveCombat.ts';
import type { CombatantInput, CombatResult } from './types.ts';
import { classDamageBase } from '../progression/damageTypes.ts';

/** Total des dégâts infligés par un combattant (coups directs + tics de ses DoT). */
function damageBy(r: CombatResult, id: string): number {
  let total = 0;
  for (const e of r.events) {
    if (e.type !== 'attack') continue;
    const dealer = e.sourceId ?? e.actorId; // DoT → sourceId = lanceur
    if (dealer === id) total += e.damage;
  }
  return total;
}

/** Mannequin encaisseur (ne meurt pas, ne rend quasi aucun coup) pour mesurer les dégâts. */
const dummy: CombatantInput = { id: 'e', name: 'Mannequin', role: 'enemy', hp: 1_000_000, atk: 1, def: 0, speed: 1 };

describe('amplificateur de type — base (physique)', () => {
  it('un amp physique ×2 double les dégâts de l’attaque de base (seed identique)', () => {
    const base: CombatantInput = { id: 'h', name: 'H', role: 'dps', hp: 1000, atk: 100, def: 0, speed: 10, basicType: 'physical' };
    const amped: CombatantInput = { ...base, dmgAmp: { physical: 1 } };
    const d0 = damageBy(resolveCombat({ allies: [base], enemies: [{ ...dummy }], seed: 42 }), 'h');
    const d1 = damageBy(resolveCombat({ allies: [amped], enemies: [{ ...dummy }], seed: 42 }), 'h');
    expect(d0).toBeGreaterThan(0);
    expect(d1).toBeGreaterThan(d0 * 1.9);
    expect(d1).toBeLessThan(d0 * 2.1);
  });

  it('un amp d’ÉCOLE (feu) ne touche PAS une attaque de base sans école', () => {
    const base: CombatantInput = { id: 'h', name: 'H', role: 'dps', hp: 1000, atk: 100, def: 0, speed: 10, basicType: 'physical' };
    const fireAmp: CombatantInput = { ...base, dmgAmp: { fire: 1 } };
    const d0 = damageBy(resolveCombat({ allies: [base], enemies: [{ ...dummy }], seed: 7 }), 'h');
    const d1 = damageBy(resolveCombat({ allies: [fireAmp], enemies: [{ ...dummy }], seed: 7 }), 'h');
    expect(d1).toBe(d0); // aucune école sur l'attaque de base → amp feu neutre
  });
});

describe('amplificateur de type — école (feu) sur un DoT de brûlure', () => {
  it('un amp feu augmente les dégâts du DoT de burn appliqué par la source', () => {
    // Héros qui pose un burn à chaque coup (on_hit). Le tic de burn porte l'école 'fire'.
    const burner: CombatantInput = {
      id: 'h',
      name: 'Pyro',
      role: 'dps',
      hp: 1000,
      atk: 100,
      def: 0,
      speed: 10,
      basicType: 'magical',
      abilities: [{ kind: 'on_hit', status: 'burn', chance: 1, potency: 0.5, duration: 5 }],
    };
    const withFire: CombatantInput = { ...burner, dmgAmp: { fire: 1 } };
    const d0 = damageBy(resolveCombat({ allies: [burner], enemies: [{ ...dummy }], seed: 99 }), 'h');
    const d1 = damageBy(resolveCombat({ allies: [withFire], enemies: [{ ...dummy }], seed: 99 }), 'h');
    // Les dégâts totaux (attaque magique + DoT feu) montent avec l'amp feu.
    expect(d1).toBeGreaterThan(d0);
  });
});

describe('set heal→dégâts (heal_convert)', () => {
  it('une part des soins émis frappe un ennemi', () => {
    // Soigneur qui lance un soin de zone tous les 2 tours ; un tank blessé le
    // déclenche. Avec heal_convert, la moitié du soin part en dégâts sur l'ennemi.
    const enemy: CombatantInput = { id: 'e', name: 'E', role: 'enemy', hp: 1_000_000, atk: 60, def: 0, speed: 5 };
    const tank: CombatantInput = { id: 't', name: 'Tank', role: 'tank', hp: 4000, startHp: 800, atk: 1, def: 0, speed: 8 };
    const healerBase: CombatantInput = {
      id: 'h',
      name: 'Soigneur',
      role: 'healer',
      hp: 1500,
      atk: 10,
      def: 0,
      speed: 20,
      abilities: [{ kind: 'autocast', everyRounds: 2, action: { type: 'heal_all', pct: 0.3 } }],
    };
    const healerConv: CombatantInput = {
      ...healerBase,
      abilities: [...(healerBase.abilities ?? []), { kind: 'heal_convert', ratio: 0.5 }],
    };
    const dmgToEnemy = (allies: CombatantInput[]) => {
      const r = resolveCombat({ allies, enemies: [{ ...enemy }], seed: 5 });
      return r.events.reduce((s, e) => (e.type === 'attack' && e.targetId === 'e' ? s + e.damage : s), 0);
    };
    const base = dmgToEnemy([healerBase, tank]);
    const conv = dmgToEnemy([healerConv, tank]);
    expect(conv).toBeGreaterThan(base); // la conversion ajoute des dégâts sur l'ennemi
  });
});

describe('classDamageBase', () => {
  it('mappe les classes physiques et magiques (défaut physique)', () => {
    expect(classDamageBase('guerrier')).toBe('physical');
    expect(classDamageBase('archer')).toBe('physical');
    expect(classDamageBase('paladin')).toBe('physical');
    expect(classDamageBase('mage')).toBe('magical');
    expect(classDamageBase('soigneur')).toBe('magical');
    expect(classDamageBase('inconnu')).toBe('physical');
  });
});
