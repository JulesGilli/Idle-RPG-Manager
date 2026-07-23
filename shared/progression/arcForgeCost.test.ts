import { describe, expect, it } from 'vitest';
import { scaleRecipeForArc, scaleRecipeByMult, arcTuning } from './arc.ts';
import {
  bossMaterialsForArc,
  bossMaterialForArc,
  zoneBossMaterialForArc,
  materialArcScope,
  forgeMaterialsForArc,
} from './arcMaterials.ts';
import { BOSS_MATERIALS, craftRecipe, zoneBossMaterial } from './forge.ts';

/**
 * LA FORGE EN ARC 2 — trois symptômes, une même cause : le front lisait le
 * catalogue et les coûts de l'ARC 1.
 *
 *  • quantités fausses  → `forgeCostMult` n'était appliqué que côté serveur ;
 *  • essences fausses   → `BOSS_MATERIALS` est un catalogue d'arc 1 ;
 *  • ressources d'arc 1 → conséquence des deux précédents.
 */

describe('scaleRecipeForArc — ce que le serveur facture VRAIMENT', () => {
  it('arc 1 : recette inchangée', () => {
    const r = { gold: 1000, materials: [{ key: 'ecorce', qty: 8 }] };
    expect(scaleRecipeForArc(r, 1)).toEqual(r);
  });

  it('arc 2 : or ET quantités passés au forgeCostMult', () => {
    const mult = arcTuning(2).forgeCostMult;
    expect(mult).toBeGreaterThan(1);
    const scaled = scaleRecipeForArc({ gold: 1000, materials: [{ key: 'x', qty: 16 }] }, 2);
    expect(scaled.gold).toBe(Math.round(1000 * mult));
    expect(scaled.materials[0]!.qty).toBe(Math.round(16 * mult));
  });

  it('jamais moins d’UN composant (un coût qui tombe à 0 serait gratuit)', () => {
    const scaled = scaleRecipeForArc({ gold: 0, materials: [{ key: 'x', qty: 1 }] }, 2);
    expect(scaled.materials[0]!.qty).toBeGreaterThanOrEqual(1);
  });

  it('ne MUTE pas la recette d’origine (elle vient de tables partagées)', () => {
    const r = { gold: 100, materials: [{ key: 'ecorce', qty: 4 }] };
    scaleRecipeForArc(r, 2);
    expect(r.materials[0]!.qty).toBe(4);
  });

  it('même résultat que la variante par multiplicateur (front == serveur)', () => {
    const r = { gold: 4000, materials: [{ key: 'ecorce', qty: 16 }] };
    expect(scaleRecipeForArc(r, 2)).toEqual(scaleRecipeByMult(r, arcTuning(2).forgeCostMult));
  });
});

describe('essences de boss — catalogue par arc', () => {
  it('l’arc 2 a ses JUMELLES, aucune clé d’arc 1', () => {
    const a2 = bossMaterialsForArc(2);
    expect(a2).toHaveLength(BOSS_MATERIALS.length);
    for (const b of a2) expect(materialArcScope(b.key)).toBe('arc2');
  });

  it('zone, quantité et stats sont IDENTIQUES à l’arc 1 (seule la coquille change)', () => {
    const a1 = bossMaterialsForArc(1);
    const a2 = bossMaterialsForArc(2);
    a1.forEach((b, i) => {
      expect(a2[i]!.zone).toBe(b.zone);
      expect(a2[i]!.qty).toBe(b.qty);
      expect(a2[i]!.stats).toEqual(b.stats);
      expect(a2[i]!.key).not.toBe(b.key);
    });
  });

  it('la résolution est STRICTE : une essence d’arc 1 n’existe pas en arc 2', () => {
    expect(bossMaterialForArc('coeur_hydre', 1)).toBeDefined();
    expect(bossMaterialForArc('coeur_hydre', 2)).toBeUndefined();
    expect(bossMaterialForArc('coeur_gangrene', 2)).toBeDefined();
    expect(bossMaterialForArc('coeur_gangrene', 1)).toBeUndefined();
  });

  it('l’essence de la zone suit l’arc', () => {
    expect(zoneBossMaterialForArc(4, 1)!.key).toBe(zoneBossMaterial(4)!.key);
    expect(zoneBossMaterialForArc(4, 2)!.key).not.toBe(zoneBossMaterial(4)!.key);
    // Zones 1 à 3 : pas de boss, dans aucun arc.
    expect(zoneBossMaterialForArc(2, 2)).toBeNull();
  });
});

describe('recette de forge complète en arc 2', () => {
  it('ne cite QUE des clés d’arc 2, essence comprise', () => {
    const mat = forgeMaterialsForArc(2).at(-1)!;
    const boss = zoneBossMaterialForArc(mat.zone, 2)!;
    const recipe = scaleRecipeForArc(craftRecipe(mat, boss), 2);
    for (const m of recipe.materials) {
      expect(materialArcScope(m.key), `${m.key} n'est pas une ressource d'arc 2`).toBe('arc2');
    }
  });

  it('le coût annoncé dépasse celui de l’arc 1 (c’est la friction de l’arc)', () => {
    const mat1 = forgeMaterialsForArc(1).at(-1)!;
    const mat2 = forgeMaterialsForArc(2).at(-1)!;
    const c1 = scaleRecipeForArc(craftRecipe(mat1, null), 1);
    const c2 = scaleRecipeForArc(craftRecipe(mat2, null), 2);
    expect(c2.materials[0]!.qty).toBeGreaterThan(c1.materials[0]!.qty);
    expect(c2.gold).toBeGreaterThan(c1.gold);
  });
});
