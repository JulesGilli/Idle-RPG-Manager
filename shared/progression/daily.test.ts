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
  it('a bien 10 jours, seul le jour 10 donne un objet', () => {
    expect(DAILY_REWARDS).toHaveLength(DAILY_CYCLE);
    expect(DAILY_REWARDS.filter((r) => r.item)).toHaveLength(1);
    expect(rewardForDay(10).item).toBe(true);
    expect(rewardForDay(1).item).toBeUndefined();
    // Jamais d'or : uniquement des clés de matériaux.
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
