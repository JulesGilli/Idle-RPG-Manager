import { describe, expect, it } from 'vitest';
import { computeAccrual, OFFLINE_CAP_SECONDS, expeditionRates } from './idle.ts';

describe('computeAccrual', () => {
  it('ne donne rien pour un temps nul ou négatif', () => {
    const zero = computeAccrual(1, 0);
    expect(zero.gold).toBe(0);
    expect(zero.xpPerHero).toBe(0);
    expect(zero.adventures).toBe(0);
    expect(computeAccrual(3, -100).gold).toBe(0);
  });

  it('compte une aventure par minute', () => {
    expect(computeAccrual(1, 60).adventures).toBe(1);
    expect(computeAccrual(1, 59).adventures).toBe(0);
    expect(computeAccrual(1, 600).adventures).toBe(10);
  });

  it('accumule proportionnellement au temps et à la difficulté', () => {
    const oneHourD1 = computeAccrual(1, 3600);
    const oneHourD2 = computeAccrual(2, 3600);
    expect(oneHourD1.gold).toBe(expeditionRates(1).goldPerMin * 60);
    // difficulté 2 = deux fois plus d'or que difficulté 1 sur la même durée.
    expect(oneHourD2.gold).toBe(oneHourD1.gold * 2);
    expect(oneHourD1.xpPerHero).toBeGreaterThan(0);
  });

  it('plafonne au-delà de la limite hors-ligne', () => {
    const atCap = computeAccrual(2, OFFLINE_CAP_SECONDS);
    const beyond = computeAccrual(2, OFFLINE_CAP_SECONDS * 3);
    expect(beyond.capped).toBe(true);
    expect(beyond.gold).toBe(atCap.gold);
    expect(beyond.effectiveSeconds).toBe(OFFLINE_CAP_SECONDS);
  });

  it("est monotone croissant en temps (jusqu'au plafond)", () => {
    const a = computeAccrual(2, 600);
    const b = computeAccrual(2, 1200);
    expect(b.gold).toBeGreaterThanOrEqual(a.gold);
    expect(b.xpPerHero).toBeGreaterThanOrEqual(a.xpPerHero);
  });
});
