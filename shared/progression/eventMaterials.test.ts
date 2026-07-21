import { describe, expect, it } from 'vitest';
import {
  EVENT_MATERIALS,
  EVENT_MATERIAL_KEYS,
  EVENT_MATERIAL_TIER,
  eventRankMaterialQty,
} from './eventMaterials.ts';

describe('matériaux d’event — catalogue', () => {
  it('arme et armure ont chacune un matériau divin; bijou/relique non', () => {
    const slots = Object.values(EVENT_MATERIALS).map((m) => m.divineSlot).filter(Boolean).sort();
    expect(slots).toEqual(['armor', 'weapon']);
    for (const [src, m] of Object.entries(EVENT_MATERIALS)) {
      expect(m.source).toBe(src);
      expect(m.key).toMatch(/^[a-z_]+$/);
    }
  });

  it('les clés sont uniques et distinctes de gemme_brute (expédition)', () => {
    expect(new Set(EVENT_MATERIAL_KEYS).size).toBe(EVENT_MATERIAL_KEYS.length);
    expect(EVENT_MATERIAL_KEYS).not.toContain('gemme_brute');
  });

  it('sont une monnaie d’Arc 2', () => {
    expect(EVENT_MATERIAL_TIER).toBe(2);
  });
});

describe('barème dégressif par rang', () => {
  it('décroît sur le top 10 et donne 0 au-delà', () => {
    for (let r = 1; r < 10; r++) {
      expect(eventRankMaterialQty(r)).toBeGreaterThanOrEqual(eventRankMaterialQty(r + 1));
    }
    expect(eventRankMaterialQty(1)).toBeGreaterThan(eventRankMaterialQty(10));
    expect(eventRankMaterialQty(10)).toBeGreaterThan(0);
    expect(eventRankMaterialQty(11)).toBe(0);
  });

  it('le top 5 reçoit au moins 3 (règle : 1 objet Divin/semaine)', () => {
    for (let r = 1; r <= 5; r++) expect(eventRankMaterialQty(r)).toBeGreaterThanOrEqual(3);
  });

  it('rejette les rangs invalides', () => {
    expect(eventRankMaterialQty(0)).toBe(0);
    expect(eventRankMaterialQty(-1)).toBe(0);
    expect(eventRankMaterialQty(1.5)).toBe(0);
  });
});
