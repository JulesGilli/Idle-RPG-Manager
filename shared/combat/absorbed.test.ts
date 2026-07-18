import { describe, expect, it } from 'vitest';
import { resolveCombat } from './resolveCombat.ts';
import type { CombatantInput } from './types.ts';

function ally(o: Partial<CombatantInput> = {}): CombatantInput {
  return { id: 'a1', name: 'Allié', role: 'dps', hp: 300, atk: 40, def: 5, speed: 20, ...o };
}
function foe(o: Partial<CombatantInput> = {}): CombatantInput {
  return { id: 'e1', name: 'Ennemi', role: 'enemy', hp: 100, atk: 30, def: 5, speed: 10, ...o };
}
const attacksOn = (res: ReturnType<typeof resolveCombat>, id: string) =>
  res.events.filter((e) => e.type === 'attack' && e.targetId === id) as {
    damage: number;
    absorbed?: number;
  }[];

describe('Dégâts encaissés (visibilité du tank)', () => {
  it("l'armure d'un tank est comptabilisée comme encaissée", () => {
    const tank = ally({ id: 'tank', name: 'Tank', hp: 5000, def: 200, atk: 1, speed: 1 });
    const res = resolveCombat({ allies: [tank], enemies: [foe({ hp: 5000, atk: 150 })], seed: 5 });
    const hits = attacksOn(res, 'tank');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => (h.absorbed ?? 0) > 0)).toBe(true);
  });

  it('un tank SANS armure n’encaisse rien (le chiffre suit vraiment la DEF)', () => {
    const nu = ally({ id: 'nu', name: 'Nu', hp: 5000, def: 0, atk: 1, speed: 1 });
    const res = resolveCombat({ allies: [nu], enemies: [foe({ hp: 5000, atk: 150 })], seed: 5 });
    const total = attacksOn(res, 'nu').reduce((s, h) => s + (h.absorbed ?? 0), 0);
    expect(total).toBe(0);
  });

  it('plus de DEF = plus d’encaissé, à combat identique', () => {
    const run = (def: number) => {
      const t = ally({ id: 'tank', name: 'Tank', hp: 5000, def, atk: 1, speed: 1 });
      const res = resolveCombat({ allies: [t], enemies: [foe({ hp: 5000, atk: 200 })], seed: 9 });
      return attacksOn(res, 'tank').reduce((s, h) => s + (h.absorbed ?? 0), 0);
    };
    expect(run(150)).toBeGreaterThan(run(50));
  });

  it('un coup entièrement absorbé par une barrière reste visible', () => {
    // Égide + barrière massive : la cible ne perd aucun PV mais encaisse.
    const tank = ally({
      id: 'tank',
      name: 'Tank',
      hp: 5000,
      def: 0,
      atk: 1,
      speed: 1,
      abilities: [{ kind: 'barrier', pct: 0.5 }],
    });
    const res = resolveCombat({ allies: [tank], enemies: [foe({ hp: 5000, atk: 60 })], seed: 3 });
    const absorbedHits = attacksOn(res, 'tank').filter(
      (h) => h.damage === 0 && (h.absorbed ?? 0) > 0,
    );
    expect(absorbedHits.length).toBeGreaterThan(0);
  });

  it('aucun encaissé fantôme quand rien n’est réduit', () => {
    const cible = ally({ id: 'c', name: 'Cible', hp: 5000, def: 0, atk: 1, speed: 1 });
    const res = resolveCombat({ allies: [cible], enemies: [foe({ hp: 5000, atk: 100 })], seed: 11 });
    for (const h of attacksOn(res, 'c')) expect(h.absorbed ?? 0).toBe(0);
  });
});
