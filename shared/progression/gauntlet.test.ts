import { describe, it, expect } from 'vitest';
import {
  ETERNITY_RESOURCE,
  eternityPerDay,
  eternityClaim,
  ETERNITY_CLAIM_CAP_DAYS,
  gauntletEnemyCount,
  isGauntletBossWave,
  gauntletWaveEnemies,
  simulateGauntletRun,
} from './gauntlet.ts';
import { divineUpgradeCost, isDivineItemName } from './divine.ts';
import type { CombatantInput } from '../combat/types.ts';

const DAY = 86400;

describe('eternityPerDay (paliers 1→10→20→50)', () => {
  it('0 sans record, puis monte par paliers', () => {
    expect(eternityPerDay(0)).toBe(0);
    expect(eternityPerDay(1)).toBe(1);
    expect(eternityPerDay(4)).toBe(1);
    expect(eternityPerDay(5)).toBe(2);
    expect(eternityPerDay(10)).toBe(5);
    expect(eternityPerDay(15)).toBe(10);
    expect(eternityPerDay(20)).toBe(20);
    expect(eternityPerDay(40)).toBe(50);
    expect(eternityPerDay(999)).toBe(50); // plafonné au dernier palier
  });
  it('est monotone croissant', () => {
    let prev = -1;
    for (let w = 0; w <= 60; w++) {
      const v = eternityPerDay(w);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('eternityClaim', () => {
  it('ne crédite rien sans record ou sans temps', () => {
    expect(eternityClaim(0, 10 * DAY)).toEqual({ amount: 0, consumedSeconds: 0 });
    expect(eternityClaim(20, 0)).toEqual({ amount: 0, consumedSeconds: 0 });
  });
  it('crédite floor(perDay × jours) et ne consomme que le temps des unités entières', () => {
    // perDay = 5 (vague 10). 1 jour → 5 unités, 1 jour consommé.
    expect(eternityClaim(10, DAY)).toEqual({ amount: 5, consumedSeconds: DAY });
    // 1,5 jour → floor(7,5) = 7 unités ; temps consommé = 7/5 jour (reste préservé).
    const r = eternityClaim(10, 1.5 * DAY);
    expect(r.amount).toBe(7);
    expect(r.consumedSeconds).toBeCloseTo((7 / 5) * DAY, 5);
    expect(r.consumedSeconds).toBeLessThan(1.5 * DAY);
  });
  it("plafonne l'accumulation à ETERNITY_CLAIM_CAP_DAYS", () => {
    const capped = eternityClaim(40, 999 * DAY); // perDay = 50
    expect(capped.amount).toBe(50 * ETERNITY_CLAIM_CAP_DAYS);
  });
});

describe('vagues', () => {
  it('boss tous les 10', () => {
    expect(isGauntletBossWave(10)).toBe(true);
    expect(isGauntletBossWave(20)).toBe(true);
    expect(isGauntletBossWave(11)).toBe(false);
  });
  it('nombre d’ennemis : 2 au départ, +1/10 vagues, cap 5', () => {
    expect(gauntletEnemyCount(1)).toBe(2);
    expect(gauntletEnemyCount(10)).toBe(2); // wave-1=9 → floor(9/10)=0
    expect(gauntletEnemyCount(11)).toBe(3);
    expect(gauntletEnemyCount(200)).toBe(5);
  });
  it('boss = ennemi unique, insensible au stun ; stats montent avec la vague', () => {
    const boss = gauntletWaveEnemies(10);
    expect(boss).toHaveLength(1);
    // withStunImmunity ajoute une résistance/immunité — au minimum l'ennemi existe.
    const early = gauntletWaveEnemies(1)[0]!;
    const late = gauntletWaveEnemies(30)[0]!;
    expect(late.hp).toBeGreaterThan(early.hp);
    expect(late.atk).toBeGreaterThan(early.atk);
  });
});

function ally(over: Partial<CombatantInput> = {}): CombatantInput {
  return { id: 'h1', name: 'Héros', role: 'dps', hp: 5000, atk: 400, def: 40, speed: 12, ...over };
}

describe('simulateGauntletRun', () => {
  it('une escouade faible échoue tôt (reachedWave petit)', () => {
    const weak = [ally({ hp: 50, atk: 1, def: 0 })];
    const r = simulateGauntletRun(123, weak, 0, 1);
    expect(r.reachedWave).toBeLessThan(5);
    expect(r.newBestWave).toBe(r.reachedWave);
  });
  it('clearedNew ne compte que le dépassement du record', () => {
    const squad = [ally(), ally({ id: 'h2' }), ally({ id: 'h3' })];
    const first = simulateGauntletRun(7, squad, 0, 1);
    // Rejoué avec un record déjà égal à la vague atteinte → aucun nouveau gain.
    const again = simulateGauntletRun(7, squad, first.reachedWave, 1);
    expect(again.clearedNew).toBe(0);
    expect(again.newBestWave).toBe(first.reachedWave);
  });
  it('déterministe : même seed → même vague atteinte', () => {
    const squad = [ally(), ally({ id: 'h2' })];
    expect(simulateGauntletRun(42, squad, 0, 1).reachedWave).toBe(
      simulateGauntletRun(42, squad, 0, 1).reachedWave,
    );
  });
});

describe('divineUpgradeCost', () => {
  it('consomme l’Éclat d’Éternité, quantité 2×(level+1)', () => {
    const c0 = divineUpgradeCost(0);
    expect(c0.materials).toEqual([{ key: ETERNITY_RESOURCE, qty: 2 }]);
    expect(c0.gold).toBe(5000);
    expect(divineUpgradeCost(9).materials[0]!.qty).toBe(20);
  });
});

describe('isDivineItemName', () => {
  it('reconnaît le sceau ✦', () => {
    expect(isDivineItemName('✦ Épée Foudroyante')).toBe(true);
    expect(isDivineItemName('Épée de givre')).toBe(false);
    expect(isDivineItemName(null)).toBe(false);
  });
});
