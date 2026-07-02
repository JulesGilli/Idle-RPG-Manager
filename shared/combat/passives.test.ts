import { describe, expect, it } from 'vitest';
import { resolveCombat } from './resolveCombat.ts';
import type { CombatantInput } from './types.ts';

function hero(passives: CombatantInput['passives'] = []): CombatantInput {
  return { id: 'h1', name: 'Héros', role: 'dps', hp: 200, atk: 30, def: 10, speed: 10, passives };
}
function dummy(hp = 100): CombatantInput {
  return { id: 'e1', name: 'Mannequin', role: 'enemy', hp, atk: 15, def: 5, speed: 5 };
}

describe('passifs de combat', () => {
  it('esquive à 100% : le porteur ne subit aucun dégât', () => {
    const r = resolveCombat({
      allies: [hero([{ type: 'dodge', value: 1 }])],
      enemies: [dummy()],
      seed: 7,
    });
    const ally = r.finalState.find((f) => f.id === 'h1')!;
    expect(ally.hp).toBe(ally.maxHp);
    expect(r.result).toBe('win');
    expect(r.events.some((e) => e.message.includes('esquive'))).toBe(true);
  });

  it('vampirisme : le porteur se soigne en attaquant', () => {
    const r = resolveCombat({
      allies: [hero([{ type: 'lifesteal', value: 0.5 }])],
      enemies: [dummy(300)],
      seed: 11,
    });
    expect(
      r.events.some((e) => e.type === 'heal' && e.actorId === 'h1' && e.targetId === 'h1'),
    ).toBe(true);
  });

  it('épines : l’attaquant subit des dégâts renvoyés', () => {
    const r = resolveCombat({
      allies: [hero([{ type: 'thorns', value: 0.5 }])],
      enemies: [dummy()],
      seed: 3,
    });
    // L'ennemi frappe le héros → les épines renvoient sur l'ennemi.
    expect(r.events.some((e) => e.message.includes('épines de Héros'))).toBe(true);
  });

  it('égide : réduit les dégâts subis par rapport à un combat sans passif', () => {
    const base = resolveCombat({ allies: [hero()], enemies: [dummy()], seed: 5 });
    const shielded = resolveCombat({
      allies: [hero([{ type: 'shield', value: 0.5 }])],
      enemies: [dummy()],
      seed: 5,
    });
    const hpBase = base.finalState.find((f) => f.id === 'h1')!.hp;
    const hpShield = shielded.finalState.find((f) => f.id === 'h1')!.hp;
    expect(hpShield).toBeGreaterThanOrEqual(hpBase);
  });

  it('régénération : soigne à chaque tour', () => {
    const r = resolveCombat({
      allies: [hero([{ type: 'regen', value: 0.05 }])],
      enemies: [dummy(400)],
      seed: 13,
    });
    expect(r.events.some((e) => e.message.includes('régénère'))).toBe(true);
  });

  it('sans passif : comportement inchangé et déterministe', () => {
    const a = resolveCombat({ allies: [hero()], enemies: [dummy()], seed: 99 });
    const b = resolveCombat({ allies: [hero()], enemies: [dummy()], seed: 99 });
    expect(a).toEqual(b);
    expect(a.events.every((e) => !e.message.includes('esquive'))).toBe(true);
  });
});
