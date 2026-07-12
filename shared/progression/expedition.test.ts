import { describe, expect, it } from 'vitest';
import { arcTuning } from './arc.ts';
import { EXPEDITION_POWER_MULT, expeditionRequiredPower, type ExpeditionType } from './expedition.ts';

const TYPE: ExpeditionType = {
  id: 'exp_test',
  name: 'Test',
  min_level_required: 5,
  min_power_required: 1000,
  duration_base_seconds: 3600,
  loot_table: [],
};

const base = TYPE.min_power_required * EXPEDITION_POWER_MULT; // ×10 global

describe('expeditionRequiredPower', () => {
  it('arc 1 : base ×10 (rehaussement global des expéditions)', () => {
    expect(arcTuning(1).powerReqMult).toBe(1);
    expect(EXPEDITION_POWER_MULT).toBe(10);
    expect(expeditionRequiredPower(TYPE, 1)).toBe(base); // 10 000
    // Défaut = arc 1.
    expect(expeditionRequiredPower(TYPE)).toBe(base);
  });

  it('arc supérieur : base ×10 puis scalée par powerReqMult', () => {
    expect(expeditionRequiredPower(TYPE, 2)).toBe(Math.round(base * arcTuning(2).powerReqMult));
  });

  it('arc hors limites : replié sur un arc valide', () => {
    expect(expeditionRequiredPower(TYPE, 0)).toBe(base);
  });
});
