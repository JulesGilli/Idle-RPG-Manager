import { describe, it, expect } from 'vitest';
import {
  gemTransmuteRecipe,
  transmuteSources,
  zoneFarmMaterialForArc,
  TRANSMUTE_GEM_QTY,
  TRANSMUTE_MATERIAL_QTY,
} from './transmute';
import { GEMS } from './jewelry';
import { gemsForArc, forgeMaterialsForArc } from './arcMaterials';

/**
 * Gemme d'arc 1 par id ; en arc 2 on prend son JUMEAU (qui porte un id
 * différent — `gemsForArc(2)` est dérivé de `GEMS` position par position).
 */
const gem = (id: string, arc = 1) => {
  const i = GEMS.findIndex((g) => g.id === id);
  expect(i).toBeGreaterThanOrEqual(0);
  return gemsForArc(arc)[i]!;
};

describe('transmutation de gemmes', () => {
  it('coûte 2 gemmes source + 30 composants de la zone CIBLE', () => {
    const source = gem('gemme_venin'); // zone 4
    const target = gem('gemme_astrale'); // zone 10
    const r = gemTransmuteRecipe(source, target, 1)!;

    expect(r.gold).toBe(0);
    expect(r.materials).toEqual([
      { key: 'gemme_venin', qty: TRANSMUTE_GEM_QTY },
      // Le composant vient de la zone 10 (la cible), pas de la zone 4.
      { key: 'poussiere_etoile', qty: TRANSMUTE_MATERIAL_QTY },
    ]);
  });

  it('refuse une transmutation vers la même gemme (le joueur perdrait tout)', () => {
    const g = gem('gemme_seve');
    expect(gemTransmuteRecipe(g, g, 1)).toBeNull();
  });

  it('paie en composants d’ARC 2 pour un joueur d’arc 2', () => {
    const source = gem('gemme_seve', 2);
    const target = gem('gemme_astrale', 2);
    const r = gemTransmuteRecipe(source, target, 2)!;

    const arc2Zone10 = forgeMaterialsForArc(2).find((m) => m.zone === 10)!.materials[0]!.key;
    expect(r.materials[1]!.key).toBe(arc2Zone10);
    // Le jumeau d'arc 2 a bien une clé DIFFÉRENTE : sans ça, un joueur d'arc 2
    // paierait avec un stock d'arc 1 qu'il ne gagne plus.
    expect(arc2Zone10).not.toBe('poussiere_etoile');
    expect(r.materials[0]!.key).toBe(source.id);
    expect(source.id).not.toBe('gemme_seve');
  });

  it('aucun surcoût d’arc : le prix est le même dans les deux arcs', () => {
    const a1 = gemTransmuteRecipe(gem('gemme_seve'), gem('gemme_astrale'), 1)!;
    const a2 = gemTransmuteRecipe(gem('gemme_seve', 2), gem('gemme_astrale', 2), 2)!;
    expect(a1.materials.map((m) => m.qty)).toEqual(a2.materials.map((m) => m.qty));
  });

  it('chaque gemme est atteignable depuis n’importe quelle autre', () => {
    for (const arc of [1, 2]) {
      const gems = gemsForArc(arc);
      for (const target of gems) {
        const sources = transmuteSources(target.id, arc);
        expect(sources).toHaveLength(gems.length - 1);
        for (const s of sources) expect(gemTransmuteRecipe(s, target, arc)).not.toBeNull();
      }
    }
  });

  it('toute zone de gemme a un composant de farm dans les deux arcs', () => {
    for (const arc of [1, 2]) {
      for (const g of GEMS) expect(zoneFarmMaterialForArc(g.zone, arc)).toBeTruthy();
    }
  });
});
