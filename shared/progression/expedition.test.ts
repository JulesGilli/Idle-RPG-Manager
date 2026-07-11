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
  it('arc 1 : seuil inchangé (référence)', () => {
    expect(arcTuning(1).powerReqMult).toBe(1);
    expect(expeditionRequiredPower(TYPE, 1)).toBe(1000);
    // Défaut = arc 1.
    expect(expeditionRequiredPower(TYPE)).toBe(1000);
  });

  it('arc supérieur : seuil scalé par powerReqMult', () => {
    expect(expeditionRequiredPower(TYPE, 2)).toBe(Math.round(1000 * arcTuning(2).powerReqMult));
  });

  it('arc hors limites : replié sur un arc valide', () => {
    expect(expeditionRequiredPower(TYPE, 0)).toBe(1000);
  });
});
