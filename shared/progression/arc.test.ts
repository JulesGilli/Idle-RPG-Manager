import { describe, expect, it } from 'vitest';
import { MAX_ARC, arcTuning, clampArc, tierGearMult, tierOfArc } from './arc.ts';

describe('arc model', () => {
  it('tier = numéro d\'arc', () => {
    expect(tierOfArc(1)).toBe(1);
    expect(tierOfArc(2)).toBe(2);
  });

  it('borne les arcs hors limites', () => {
    expect(clampArc(0)).toBe(1);
    expect(clampArc(-5)).toBe(1);
    expect(clampArc(999)).toBe(MAX_ARC);
    expect(clampArc(1.9)).toBe(1); // tronqué
  });

  it('arc 1 = neutre, arcs supérieurs strictement plus durs', () => {
    const a1 = arcTuning(1);
    expect(a1.enemyHpMult).toBe(1);
    expect(a1.enemyAtkMult).toBe(1);
    expect(a1.forgeCostMult).toBe(1);
    for (let a = 2; a <= MAX_ARC; a++) {
      const t = arcTuning(a);
      expect(t.enemyHpMult).toBeGreaterThan(1);
      expect(t.enemyAtkMult).toBeGreaterThan(1);
      expect(t.forgeCostMult).toBeGreaterThan(1);
      expect(t.accent).toMatch(/^#/);
    }
  });

  it('repli sur l\'arc 1 pour un arc inconnu', () => {
    expect(arcTuning(0).arc).toBe(1);
  });

  it('le stuff monte (tier > 1) mais RESTE sous le scaling ennemi (arc plus dur)', () => {
    expect(tierGearMult(1)).toBe(1);
    for (let a = 2; a <= MAX_ARC; a++) {
      const t = arcTuning(a);
      expect(t.gearStatMult).toBeGreaterThan(1); // T2 bien au-dessus du T1
      expect(t.gearStatMult).toBeLessThan(t.enemyHpMult); // …mais sous les ennemis
    }
  });
});
