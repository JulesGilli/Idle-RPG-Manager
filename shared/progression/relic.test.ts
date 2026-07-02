import { describe, expect, it } from 'vitest';
import {
  craftRelic,
  relicRanges,
  relicRecipe,
  getRelicBase,
  RELIC_BASES,
} from './relic.ts';
import { createRng } from '../combat/prng.ts';

describe('craftRelic', () => {
  it('produit une relique nommée d’après son modèle, avec des PV', () => {
    const base = getRelicBase('talisman_vigueur')!;
    const relic = craftRelic(base, createRng(42));
    expect(relic.item_type).toBe('relic');
    expect(relic.name).toBe('Talisman de Vigueur');
    expect(relic.weight).toBeNull();
    expect(relic.hp_bonus).toBeGreaterThan(0);
  });

  it('déterministe pour une même seed', () => {
    const base = getRelicBase('idole_guerre')!;
    const a = craftRelic(base, createRng(123));
    const b = craftRelic(base, createRng(123));
    expect(a).toEqual(b);
  });

  it('le biais oriente les stats : le talisman est surtout PV, l’idole surtout ATK', () => {
    const talisman = getRelicBase('talisman_vigueur')!;
    const idole = getRelicBase('idole_guerre')!;
    let sumHpT = 0;
    let sumAtkT = 0;
    let sumAtkI = 0;
    for (let s = 0; s < 100; s++) {
      const t = craftRelic(talisman, createRng(s));
      const i = craftRelic(idole, createRng(s));
      sumHpT += t.hp_bonus;
      sumAtkT += t.atk_bonus;
      sumAtkI += i.atk_bonus;
    }
    expect(sumHpT).toBeGreaterThan(sumAtkT); // talisman : PV >> ATK
    expect(sumAtkI).toBeGreaterThan(sumAtkT); // idole plus d'ATK que le talisman
  });

  it('les stats craftées restent dans la range affichée', () => {
    for (const base of RELIC_BASES) {
      const ranges = relicRanges(base);
      for (let s = 0; s < 50; s++) {
        const r = craftRelic(base, createRng(s * 17 + 1));
        expect(r.atk_bonus).toBeGreaterThanOrEqual(ranges.atk[0]);
        expect(r.atk_bonus).toBeLessThanOrEqual(ranges.atk[1]);
        expect(r.def_bonus).toBeGreaterThanOrEqual(ranges.def[0]);
        expect(r.def_bonus).toBeLessThanOrEqual(ranges.def[1]);
        expect(r.hp_bonus).toBeGreaterThanOrEqual(ranges.hp[0]);
        expect(r.hp_bonus).toBeLessThanOrEqual(ranges.hp[1]);
      }
    }
  });

  it('la recette consomme fragments de relique + sceau de catacombe', () => {
    const recipe = relicRecipe(getRelicBase('egide_ancestrale')!);
    expect(recipe.gold).toBeGreaterThan(0);
    const keys = recipe.materials.map((m) => m.key);
    expect(keys).toContain('fragment_relique');
    expect(keys).toContain('sceau_catacombe');
  });
});
