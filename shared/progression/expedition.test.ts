import { describe, expect, it } from 'vitest';
import { arcTuning } from './arc.ts';
import { expeditionRequiredPower, type ExpeditionType } from './expedition.ts';

const TYPE: ExpeditionType = {
  id: 'exp_test',
  name: 'Test',
  min_level_required: 5,
  min_power_required: 1000,
  duration_base_seconds: 3600,
  loot_table: [],
};

describe('expeditionRequiredPower', () => {
  it('arc 1 : valeur brute (min_power_required), sans rehaussement global', () => {
    expect(arcTuning(1).powerReqMult).toBe(1);
    expect(expeditionRequiredPower(TYPE, 1)).toBe(1000);
    // Défaut = arc 1.
    expect(expeditionRequiredPower(TYPE)).toBe(1000);
  });

  it('arc 2 : ×10 le seuil de l’arc 1', () => {
    expect(arcTuning(2).powerReqMult).toBe(10);
    expect(expeditionRequiredPower(TYPE, 2)).toBe(10_000);
  });

  it('arc hors limites : replié sur un arc valide (arc 1)', () => {
    expect(expeditionRequiredPower(TYPE, 0)).toBe(1000);
  });
});
