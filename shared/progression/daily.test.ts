import { describe, expect, it } from 'vitest';
import {
  DAILY_CYCLE,
  DAILY_REWARDS,
  rewardForDay,
  daysBetween,
  nextClaimDay,
  dailyStatus,
} from './daily.ts';
import { FORGE_BASES, getMaterialTier } from './forge.ts';

describe('daily reward', () => {
  it('10 jours d’équipement : armes Z1, puis chaque zone livre armures → armes', () => {
    expect(DAILY_REWARDS).toHaveLength(DAILY_CYCLE);
    expect(DAILY_REWARDS.map((r) => r.day)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(
      DAILY_REWARDS.map((r) => `${r.kind[0]}${getMaterialTier(r.materialId)!.zone}`),
    ).toEqual(['w1', 'a2', 'w2', 'a3', 'w3', 'a4', 'w4', 'a5', 'w5', 'a6']);
  });

  /**
   * Chaque `materialId` doit exister dans FORGE_MATERIALS : l'Edge Function fait
   * `getMaterialTier(...)` et, sur `undefined`, n'offre RIEN — en silence, après
   * avoir déjà consommé la journée du joueur. Une faute de frappe ici brûlerait
   * le claim sans le moindre message d'erreur.
   */
  it('chaque jour pointe un composant de forge réel', () => {
    for (const r of DAILY_REWARDS) {
      expect(getMaterialTier(r.materialId), `jour ${r.day} : ${r.materialId}`).toBeDefined();
    }
  });

  /** Le lot = TOUS les modèles du type. Ajouter une arme à FORGE_BASES l'ajoute au calendrier. */
  it('un lot couvre tous les modèles de son type (8 armes / 3 armures)', () => {
    expect(FORGE_BASES.filter((b) => b.itemType === 'weapon')).toHaveLength(8);
    expect(FORGE_BASES.filter((b) => b.itemType === 'armor')).toHaveLength(3);
  });

  it('rewardForDay borne les jours hors cycle', () => {
    expect(rewardForDay(1)).toEqual({ day: 1, kind: 'weapon', materialId: 'chene' });
    expect(rewardForDay(10)).toEqual({ day: 10, kind: 'armor', materialId: 'runique' });
    expect(rewardForDay(0)).toBe(rewardForDay(1));
    expect(rewardForDay(99)).toBe(rewardForDay(10));
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
