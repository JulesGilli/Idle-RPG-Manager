import { describe, expect, it } from 'vitest';
import {
  craftJewel,
  GEMS,
  getGem,
  gemByPassive,
  jewelPct,
  jewelPctRange,
  jewelRecipe,
  refinedJewelPct,
  refineCost,
  refineSuccessChance,
  REFINE_MAX,
} from './jewelry.ts';
import { getMaterialTier, FORGE_MATERIALS } from './forge.ts';
import { createRng } from '../combat/prng.ts';

describe('craftJewel', () => {
  it('nom = "Amulette <composant> <gemme>", passif de la gemme, tier du composant', () => {
    const mat = getMaterialTier('obsidienne')!;
    const gem = getGem('gemme_abyssale')!;
    const jewel = craftJewel(mat, gem, createRng(42));
    expect(jewel.name).toBe("Amulette d'obsidienne du Vampire");
    expect(jewel.passive_type).toBe('lifesteal');
    expect(jewel.item_type).toBe('jewel');
    expect(jewel.weight).toBeNull();
    expect(jewel.tier).toBe(mat.craftTier);
    expect(jewel.passive_value).toBeGreaterThan(0);
  });

  it('la puissance du % vient du composant, pas de la gemme', () => {
    const gem = getGem('gemme_glace')!;
    const z1 = getMaterialTier('chene')!;
    const z10 = getMaterialTier('etoiles')!;
    // Même gemme, composant plus haut → % plus fort.
    expect(jewelPct(z10, gem, 'common')).toBeGreaterThan(jewelPct(z1, gem, 'common'));
    // Même composant, gemme différente → même logique de puissance mais base propre.
    const dodge = getGem('gemme_ombre')!;
    expect(jewelPct(z1, dodge, 'common')).toBe(
      Math.min(dodge.maxPct, Math.max(1, Math.round(dodge.basePct))),
    );
  });

  it('le % est plafonné au maxPct de la gemme', () => {
    for (const gem of GEMS) {
      for (const mat of FORGE_MATERIALS) {
        expect(jewelPct(mat, gem, 'ultimate')).toBeLessThanOrEqual(gem.maxPct);
        expect(jewelPct(mat, gem, 'poor')).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('le % crafté reste dans la range affichée', () => {
    for (const gem of GEMS) {
      for (const mat of FORGE_MATERIALS) {
        const [min, max] = jewelPctRange(mat, gem);
        for (let s = 0; s < 30; s++) {
          const jewel = craftJewel(mat, gem, createRng(s * 17 + 3));
          expect(jewel.passive_value).toBeGreaterThanOrEqual(min);
          expect(jewel.passive_value).toBeLessThanOrEqual(max);
        }
      }
    }
  });

  it('la recette = coût du composant + 1 gemme', () => {
    const mat = getMaterialTier('givre')!;
    const gem = getGem('gemme_seve')!;
    const recipe = jewelRecipe(mat, gem);
    expect(recipe.gold).toBe(mat.gold);
    expect(recipe.materials).toContainEqual({ key: 'gemme_seve', qty: 1 });
    expect(recipe.materials).toContainEqual({ key: 'cristal', qty: 10 });
  });

  it('chaque zone a sa gemme, chaque gemme un passif distinct', () => {
    expect(GEMS).toHaveLength(10);
    expect(new Set(GEMS.map((g) => g.mapId)).size).toBe(10);
    expect(new Set(GEMS.map((g) => g.passive)).size).toBe(10);
  });
});

describe('raffinement', () => {
  it('chaque niveau augmente le %, plafonné au maxPct de la gemme', () => {
    const gem = getGem('gemme_abyssale')!;
    let prev = refinedJewelPct(8, 0, gem);
    expect(prev).toBe(8);
    for (let l = 1; l <= REFINE_MAX; l++) {
      const v = refinedJewelPct(8, l, gem);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBeLessThanOrEqual(gem.maxPct);
      prev = v;
    }
    // Une base déjà au plafond ne dépasse jamais.
    expect(refinedJewelPct(gem.maxPct, REFINE_MAX, gem)).toBe(gem.maxPct);
  });

  it('le coût consomme 1 gemme du même type et de l’or croissant', () => {
    const gem = gemByPassive('thorns')!;
    const c0 = refineCost(0, gem);
    const c3 = refineCost(3, gem);
    expect(c0.materials).toEqual([{ key: gem.id, qty: 1 }]);
    expect(c3.gold).toBeGreaterThan(c0.gold);
  });

  it('la chance de réussite décroît mais reste ≥ 25%', () => {
    expect(refineSuccessChance(0)).toBeCloseTo(0.9);
    for (let l = 0; l < REFINE_MAX; l++) {
      expect(refineSuccessChance(l)).toBeGreaterThanOrEqual(0.25);
      expect(refineSuccessChance(l + 1)).toBeLessThanOrEqual(refineSuccessChance(l));
    }
  });
});
