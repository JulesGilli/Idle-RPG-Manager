import { describe, expect, it } from 'vitest';
import { scaleRecipeForArc, ARC_COST_EXEMPT, isArcCostExempt, arcTuning } from './arc.ts';
import { relicRecipe, relicSealQty } from './relic.ts';
import { jewelRecipe, refineCost } from './jewelry.ts';
import { divineRecipe } from './divine.ts';
import { FORGE_BASES } from './forge.ts';
import { setPieceRecipe, SET_PIECES, SETS, setArc } from './sets.ts';
import {
  forgeMaterialsForArc,
  zoneBossMaterialForArc,
  gemsForArc,
  arcMaterialKey,
  ARC2_TWINS,
} from './arcMaterials.ts';
import { MAX_ARC } from './arc.ts';

/**
 * LE SCEAU DES CATACOMBES COÛTE TOUJOURS 1.
 *
 * C'est un butin de donjon RARE, à cadence fixe : un donjon en rend une poignée,
 * quel que soit l'arc. Le passer par `forgeCostMult` faisait grimper une relique
 * à 5 sceaux en arc 2 — un coût qui ne rendait pas la relique plus chère, mais
 * inatteignable, puisque le robinet n'a pas été multiplié en face.
 */

const SEAL = (arc: number) => arcMaterialKey('sceau_catacombe', arc);
const qtyOf = (r: { materials: { key: string; qty: number }[] }, key: string) =>
  r.materials.find((m) => m.key === key)?.qty ?? 0;

describe('coût en sceaux', () => {
  it('une relique coûte 1 sceau, dans TOUS les arcs et sur TOUTES les zones', () => {
    for (let arc = 1; arc <= MAX_ARC; arc++) {
      for (const mat of forgeMaterialsForArc(arc)) {
        const boss = zoneBossMaterialForArc(mat.zone, arc);
        const r = scaleRecipeForArc(relicRecipe(mat, boss, arc), arc);
        expect(qtyOf(r, SEAL(arc)), `arc ${arc}, zone ${mat.zone}`).toBe(1);
      }
    }
  });

  it('une pièce de set aussi', () => {
    for (let arc = 1; arc <= MAX_ARC; arc++) {
      const ids = new Set(SETS.filter((s) => setArc(s) === arc).map((s) => s.id));
      for (const piece of SET_PIECES.filter((p) => ids.has(p.setId))) {
        const mat = forgeMaterialsForArc(arc).at(-1)!;
        const r = scaleRecipeForArc(setPieceRecipe(piece, mat), arc);
        expect(qtyOf(r, SEAL(arc)), `${piece.id} (arc ${arc})`).toBe(1);
      }
    }
  });

  it('le reste de la recette, lui, suit bien le multiplicateur d’arc', () => {
    // Garde-fou : l'exemption doit viser le SEUL sceau, pas désamorcer la
    // friction d'économie de l'arc sur tout le reste.
    const mat = forgeMaterialsForArc(2).at(-1)!;
    const brut = relicRecipe(mat, zoneBossMaterialForArc(mat.zone, 2), 2);
    const reel = scaleRecipeForArc(brut, 2);
    const farm = mat.materials[0]!.key;
    expect(qtyOf(reel, farm)).toBe(Math.round(qtyOf(brut, farm) * arcTuning(2).forgeCostMult));
    expect(reel.gold).toBe(Math.round(brut.gold * arcTuning(2).forgeCostMult));
  });

  it('l’exemption couvre le sceau ET son jumeau d’arc 2', () => {
    // `arc.ts` ne peut pas importer `arcMaterials.ts` (cycle) : la liste est
    // écrite en dur. Ce test est ce qui empêche le jumeau d'y manquer.
    expect(ARC_COST_EXEMPT).toContain('sceau_catacombe');
    expect(ARC_COST_EXEMPT).toContain(ARC2_TWINS['sceau_catacombe']!.key);
  });

  it('la quantité de base ne dépend plus du tier du matériau', () => {
    const z1 = forgeMaterialsForArc(2)[0]!;
    const z10 = forgeMaterialsForArc(2).at(-1)!;
    expect(relicSealQty(z1)).toBe(1);
    expect(relicSealQty(z10)).toBe(1);
  });
});

describe('coût en gemmes', () => {
  it('un bijou coûte 1 gemme, dans TOUS les arcs', () => {
    for (let arc = 1; arc <= MAX_ARC; arc++) {
      for (const mat of forgeMaterialsForArc(arc)) {
        for (const gem of gemsForArc(arc)) {
          const r = scaleRecipeForArc(jewelRecipe(mat, gem), arc);
          expect(qtyOf(r, gem.id), `arc ${arc}, ${gem.id}`).toBe(1);
        }
      }
    }
  });

  it('le raffinage et la relique divine aussi', () => {
    for (let arc = 1; arc <= MAX_ARC; arc++) {
      const mat = forgeMaterialsForArc(arc).at(-1)!;
      const gem = gemsForArc(arc)[0]!;
      const raff = scaleRecipeForArc(refineCost(3, mat.materials[0]!.key, gem.id), arc);
      expect(qtyOf(raff, gem.id), `raffinage arc ${arc}`).toBe(1);
      const arme = FORGE_BASES.find((b) => b.itemType === 'weapon')!;
      const div = scaleRecipeForArc(divineRecipe(arme, mat, gem), arc);
      expect(qtyOf(div, gem.id), `divin arc ${arc}`).toBe(1);
    }
  });

  it('les gemmes d’EXPÉDITION, elles, restent soumises à la friction d’arc', () => {
    // `gemme_brute`/`gemme_fracturee` ne sont pas des gemmes de joaillerie : ce
    // sont des matériaux d'expédition, dont le robinet suit l'arc. Les exempter
    // par erreur (via le préfixe `gemme_`) brade les pièces de set.
    expect(isArcCostExempt('gemme_brute')).toBe(false);
    expect(isArcCostExempt('gemme_fracturee')).toBe(false);
    const piece = SET_PIECES.find((p) => p.materials.some((m) => m.key === 'gemme_brute'))!;
    const mat2 = forgeMaterialsForArc(2).at(-1)!;
    const brut = setPieceRecipe(piece, mat2);
    const reel = scaleRecipeForArc(brut, 2);
    expect(qtyOf(reel, 'gemme_fracturee')).toBeGreaterThan(qtyOf(brut, 'gemme_fracturee'));
  });

  it('l’exemption couvre TOUTES les gemmes de joaillerie, des deux arcs', () => {
    for (let arc = 1; arc <= MAX_ARC; arc++) {
      for (const gem of gemsForArc(arc)) {
        expect(isArcCostExempt(gem.id), `${gem.id} non exemptée`).toBe(true);
      }
    }
  });
});
