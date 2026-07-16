import { describe, expect, it } from 'vitest';
import { ARCS, MAX_ARC_TIER, arcByIndex, arcOfMap, arcByGateBoss } from './arcs.ts';

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

  /**
   * Le tier de craft se dérivait des boss d'arc vaincus (`unlockedMaterialTier`,
   * table `player_arc_progress`) : table jamais créée, design abandonné. Le gate
   * est passé dans l'Edge Function forge et compare le tier à l'arc courant.
   * Ce qui compte encore ici : arc N ⇒ tier N, sinon le gate ouvrirait le mauvais.
   */
  it('l’arc N ouvre le tier N — le gate de craft en dépend', () => {
    for (const a of ARCS) expect(a.tier, a.id).toBe(a.index);
  });
});
