import { describe, expect, it } from 'vitest';
import {
  DAILY_CYCLE,
  DAILY_REWARDS,
  rewardForDay,
  daysBetween,
  nextClaimDay,
  dailyStatus,
} from './daily.ts';

describe('daily reward', () => {
  it('a bien 10 jours ; reliques J3/6/9, set complet J10, jamais d’or', () => {
    expect(DAILY_REWARDS).toHaveLength(DAILY_CYCLE);
    // Reliques offertes les jours 3, 6, 9 (une par zone).
    expect(DAILY_REWARDS.filter((r) => r.relics).map((r) => r.day)).toEqual([3, 6, 9]);
    // Set complet uniquement le jour 10.
    expect(DAILY_REWARDS.filter((r) => r.set).map((r) => r.day)).toEqual([10]);
    expect(rewardForDay(10).set?.materialId).toBe('obsidienne');
    expect(rewardForDay(3).relics?.materialId).toBe('chene');
    // Jamais d'or : uniquement des clés de ressources en quantité positive.
    for (const r of DAILY_REWARDS) expect(r.materials.every((m) => m.qty > 0)).toBe(true);
  });

  it('daysBetween compte les jours civils', () => {
    expect(daysBetween('2026-07-07', '2026-07-08')).toBe(1);
    expect(daysBetween('2026-07-07', '2026-07-07')).toBe(0);
    expect(daysBetween('2026-07-07', '2026-07-10')).toBe(3);
  });

  it('premier claim = jour 1', () => {
    expect(nextClaimDay({ lastClaimDate: null, dayIndex: 0 }, '2026-07-07')).toBe(1);
  });

  it('claim consécutif = jour suivant', () => {
    expect(nextClaimDay({ lastClaimDate: '2026-07-06', dayIndex: 3 }, '2026-07-07')).toBe(4);
  });

  it('jour manqué (écart > 1) = série remise à 1', () => {
    expect(nextClaimDay({ lastClaimDate: '2026-07-04', dayIndex: 5 }, '2026-07-07')).toBe(1);
  });

  it('après le jour 10, le cycle repart au jour 1', () => {
    expect(nextClaimDay({ lastClaimDate: '2026-07-06', dayIndex: 10 }, '2026-07-07')).toBe(1);
  });

  it('déjà réclamé aujourd’hui → pas de claim', () => {
    const s = dailyStatus({ lastClaimDate: '2026-07-07', dayIndex: 4 }, '2026-07-07');
    expect(s).toEqual({ canClaim: false, alreadyClaimedToday: true, day: 4 });
  });

  it('nouveau jour consécutif → claim du jour suivant', () => {
    const s = dailyStatus({ lastClaimDate: '2026-07-06', dayIndex: 4 }, '2026-07-07');
    expect(s).toEqual({ canClaim: true, alreadyClaimedToday: false, day: 5 });
  });
});
