import { describe, expect, it } from 'vitest';
import {
  DAILY_CYCLE,
  DAILY_KIND_CYCLE,
  DAILY_RARITY,
  kindForDay,
  daysBetween,
  nextClaimDay,
  dailyStatus,
} from './daily.ts';
import { FORGE_BASES } from './forge.ts';
import { RELIC_BASES } from './relic.ts';

describe('daily reward', () => {
  it('cycle de 3 jours : arme, armure, relique', () => {
    expect(DAILY_CYCLE).toBe(3);
    expect(DAILY_KIND_CYCLE).toEqual(['weapon', 'armor', 'relic']);
    expect(DAILY_RARITY).toBe('ultimate');
  });

  it('kindForDay boucle sur le cycle et borne les jours hors plage', () => {
    expect(kindForDay(1)).toBe('weapon');
    expect(kindForDay(2)).toBe('armor');
    expect(kindForDay(3)).toBe('relic');
    expect(kindForDay(4)).toBe('weapon'); // reboucle
    expect(kindForDay(0)).toBe('weapon'); // plancher
    expect(kindForDay(-5)).toBe('weapon');
  });

  /** Le lot = TOUS les modèles du type. Ajouter une arme à FORGE_BASES l'ajoute au calendrier. */
  it('un lot couvre tous les modèles de son type (8 armes / 3 armures / 3 reliques)', () => {
    expect(FORGE_BASES.filter((b) => b.itemType === 'weapon')).toHaveLength(8);
    expect(FORGE_BASES.filter((b) => b.itemType === 'armor')).toHaveLength(3);
    expect(RELIC_BASES).toHaveLength(3);
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
    expect(nextClaimDay({ lastClaimDate: '2026-07-06', dayIndex: 2 }, '2026-07-07')).toBe(3);
  });

  it('jour manqué (écart > 1) = série remise à 1', () => {
    expect(nextClaimDay({ lastClaimDate: '2026-07-04', dayIndex: 2 }, '2026-07-07')).toBe(1);
  });

  it('après le jour 3, le cycle repart au jour 1', () => {
    expect(nextClaimDay({ lastClaimDate: '2026-07-06', dayIndex: 3 }, '2026-07-07')).toBe(1);
  });

  it('déjà réclamé aujourd’hui → pas de claim', () => {
    const s = dailyStatus({ lastClaimDate: '2026-07-07', dayIndex: 2 }, '2026-07-07');
    expect(s).toEqual({ canClaim: false, alreadyClaimedToday: true, day: 2 });
  });

  it('nouveau jour consécutif → claim du jour suivant', () => {
    const s = dailyStatus({ lastClaimDate: '2026-07-06', dayIndex: 2 }, '2026-07-07');
    expect(s).toEqual({ canClaim: true, alreadyClaimedToday: false, day: 3 });
  });
});
