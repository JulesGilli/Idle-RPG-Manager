import { describe, expect, it } from 'vitest';
import {
  refineryDropMult,
  refineryBonusPct,
  refineryUpgradeCost,
  refineryMaxed,
  REFINERY_MAX_LEVEL,
  REFINERY_BASE_COST,
} from './refinery.ts';

describe('Raffinerie — multiplicateur de drop', () => {
  it('niveau 0 = aucun bonus', () => {
    expect(refineryDropMult(0)).toBe(1);
    expect(refineryBonusPct(0)).toBe(0);
  });

  it('croît de +5 % par niveau, plafonné à +200 % (×3) au niveau max (40)', () => {
    expect(refineryDropMult(1)).toBeCloseTo(1.05);
    expect(refineryDropMult(10)).toBeCloseTo(1.5);
    expect(refineryDropMult(REFINERY_MAX_LEVEL)).toBeCloseTo(3);
    expect(refineryBonusPct(REFINERY_MAX_LEVEL)).toBe(200);
  });

  it('borne les niveaux hors plage (jamais négatif, jamais au-delà du max)', () => {
    expect(refineryDropMult(-5)).toBe(1);
    expect(refineryDropMult(999)).toBe(refineryDropMult(REFINERY_MAX_LEVEL));
  });
});

describe('Raffinerie — coût d’upgrade', () => {
  it('part de la base et croît géométriquement', () => {
    expect(refineryUpgradeCost(0)).toBe(REFINERY_BASE_COST);
    expect(refineryUpgradeCost(1)).toBeGreaterThan(refineryUpgradeCost(0));
    expect(refineryUpgradeCost(5)).toBeGreaterThan(refineryUpgradeCost(4));
  });

  it('devient indisponible (Infinity) au niveau max', () => {
    expect(refineryMaxed(REFINERY_MAX_LEVEL)).toBe(true);
    expect(refineryUpgradeCost(REFINERY_MAX_LEVEL)).toBe(Infinity);
  });

  it('la montée complète est un vrai sink (> 1 milliard d’or)', () => {
    let total = 0;
    for (let l = 0; l < REFINERY_MAX_LEVEL; l++) total += refineryUpgradeCost(l);
    expect(total).toBeGreaterThan(1_000_000_000);
  });

  it('le DERNIER palier (39 → 40) coûte ~500 M', () => {
    const last = refineryUpgradeCost(REFINERY_MAX_LEVEL - 1);
    expect(last).toBeGreaterThan(400_000_000);
    expect(last).toBeLessThan(600_000_000);
  });
});
