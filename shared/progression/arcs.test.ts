import { describe, expect, it } from 'vitest';
import {
  ARCS,
  MAX_ARC_TIER,
  arcByIndex,
  arcOfMap,
  arcByGateBoss,
  unlockedMaterialTier,
} from './arcs.ts';

describe('arcs', () => {
  it('4 arcs, tiers 1→4, Arc 1 couvre le contenu live', () => {
    expect(ARCS).toHaveLength(MAX_ARC_TIER);
    expect(ARCS.map((a) => a.tier)).toEqual([1, 2, 3, 4]);
    expect(arcByIndex(1)?.mapIds).toContain('forest');
    expect(arcByIndex(1)?.mapIds).toContain('caverns');
  });

  it('lookup par map et par gate boss', () => {
    expect(arcOfMap('forest')?.index).toBe(1);
    expect(arcOfMap('inconnu')).toBeUndefined();
    expect(arcByGateBoss('arc1_gate')?.tier).toBe(1);
  });

  it('tier débloqué = 1 + nb de boss d’arc battus, plafonné', () => {
    expect(unlockedMaterialTier([])).toBe(1);
    expect(unlockedMaterialTier(['arc1_gate'])).toBe(2);
    expect(unlockedMaterialTier(['arc1_gate', 'arc2_gate'])).toBe(3);
    // Doublons et ids inconnus ignorés.
    expect(unlockedMaterialTier(['arc1_gate', 'arc1_gate', 'zzz'])).toBe(2);
    // Plafond.
    expect(
      unlockedMaterialTier(['arc1_gate', 'arc2_gate', 'arc3_gate', 'arc4_gate']),
    ).toBe(MAX_ARC_TIER);
  });
});
