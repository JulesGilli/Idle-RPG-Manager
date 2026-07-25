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
  GAUNTLET_MAX_WAVE,
  GAUNTLET_REPLAY_KEEP,
} from './gauntlet.ts';
import { divineUpgradeCost, isDivineItemName } from './divine.ts';
import type { CombatantInput } from '../combat/types.ts';

const DAY = 86400;

describe('eternityPerDay (paliers étirés, prestige jusqu’à 5000)', () => {
  it('0 sans record, puis monte par paliers', () => {
    expect(eternityPerDay(0)).toBe(0);
    expect(eternityPerDay(1)).toBe(1);
    expect(eternityPerDay(9)).toBe(1);
    expect(eternityPerDay(10)).toBe(2);
    expect(eternityPerDay(25)).toBe(5);
    expect(eternityPerDay(50)).toBe(10);
    expect(eternityPerDay(100)).toBe(25);
    expect(eternityPerDay(150)).toBe(50); // l'ancien plafond (vague 40) vit ici
    expect(eternityPerDay(1000)).toBe(85);
    expect(eternityPerDay(5000)).toBe(120);
    expect(eternityPerDay(99_999)).toBe(120); // plafonné au dernier palier
  });
  it('est monotone croissant', () => {
    let prev = -1;
    for (let w = 0; w <= 6000; w += 7) {
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
    // perDay = 5 (vague 25). 1 jour → 5 unités, 1 jour consommé.
    expect(eternityClaim(25, DAY)).toEqual({ amount: 5, consumedSeconds: DAY });
    // 1,5 jour → floor(7,5) = 7 unités ; temps consommé = 7/5 jour (reste préservé).
    const r = eternityClaim(25, 1.5 * DAY);
    expect(r.amount).toBe(7);
    expect(r.consumedSeconds).toBeCloseTo((7 / 5) * DAY, 5);
    expect(r.consumedSeconds).toBeLessThan(1.5 * DAY);
  });
  it("plafonne l'accumulation à ETERNITY_CLAIM_CAP_DAYS", () => {
    const capped = eternityClaim(150, 999 * DAY); // perDay = 50
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
  it('loi de puissance : croissance RELATIVE décroissante (jamais de mur dur)', () => {
    const ratioAt = (w: number) =>
      gauntletWaveEnemies(w + 1)[0]!.hp / gauntletWaveEnemies(w)[0]!.hp;
    expect(ratioAt(5)).toBeGreaterThan(ratioAt(101));
    expect(ratioAt(101)).toBeGreaterThan(ratioAt(4001));
    expect(ratioAt(4001)).toBeLessThan(1.001);
  });
  it('l’ATK monte BEAUCOUP moins vite que les PV (le mur est un DPS check)', () => {
    // Invariant de design : sans ça, la course s'arrête sur du one-shot subi et
    // le mode « sans fin » bute sur un mur (bug de la vague 30).
    const w1 = gauntletWaveEnemies(1)[0]!;
    const w500 = gauntletWaveEnemies(500)[0]!;
    const hpGrowth = w500.hp / w1.hp;
    const atkGrowth = w500.atk / w1.atk;
    expect(hpGrowth).toBeGreaterThan(atkGrowth * 5);
  });
  it('le plafond absolu est 5000 (mode « sans fin »)', () => {
    expect(GAUNTLET_MAX_WAVE).toBe(5000);
  });
});

function ally(over: Partial<CombatantInput> = {}): CombatantInput {
  return { id: 'h1', name: 'Héros', role: 'dps', hp: 5000, atk: 400, def: 40, speed: 12, ...over };
}

describe('simulateGauntletRun', () => {
  it('une escouade faible échoue tôt (reachedWave petit)', () => {
    const weak = [ally({ hp: 50, atk: 1, def: 0 })];
    const r = simulateGauntletRun(123, weak, 0);
    expect(r.reachedWave).toBeLessThan(5);
    expect(r.newBestWave).toBe(r.reachedWave);
  });
  it('clearedNew ne compte que le dépassement du record', () => {
    const squad = [ally(), ally({ id: 'h2' }), ally({ id: 'h3' })];
    const first = simulateGauntletRun(7, squad, 0);
    // Rejoué avec un record déjà égal à la vague atteinte → aucun nouveau gain.
    const again = simulateGauntletRun(7, squad, first.reachedWave);
    expect(again.clearedNew).toBe(0);
    expect(again.newBestWave).toBe(first.reachedWave);
  });
  it('REPREND au record : démarre à best+1, jamais à la vague 1', () => {
    const squad = [ally(), ally({ id: 'h2' })];
    const r = simulateGauntletRun(7, squad, 40);
    expect(r.fromWave).toBe(41);
    expect(r.waveResults[0]!.wave).toBe(41);
    // Échec dès la première vague tentée → le record est CONSERVÉ (jamais de recul).
    expect(r.newBestWave).toBeGreaterThanOrEqual(40);
  });
  it('déterministe : même seed → même vague atteinte', () => {
    const squad = [ally(), ally({ id: 'h2' })];
    expect(simulateGauntletRun(42, squad, 0).reachedWave).toBe(
      simulateGauntletRun(42, squad, 0).reachedWave,
    );
  });
  it('replay : ne conserve que les DERNIERS combats (fenêtre glissante)', () => {
    const squad = [ally(), ally({ id: 'h2' }), ally({ id: 'h3' })];
    const r = simulateGauntletRun(7, squad, 0);
    expect(r.waveResults.length).toBeLessThanOrEqual(GAUNTLET_REPLAY_KEEP);
    // Le dernier combat conservé est la vague d'arrêt (la défaite qui clôt la course).
    const last = r.waveResults[r.waveResults.length - 1]!;
    expect(last.wave).toBe(r.reachedWave + 1);
    expect(last.combat.result).not.toBe('win');
  });
});

describe('divineUpgradeCost', () => {
  it('consomme l’Éclat d’Éternité, quantité 4×(level+1) (sink end-game ×2)', () => {
    const c0 = divineUpgradeCost(0);
    expect(c0.materials).toEqual([{ key: ETERNITY_RESOURCE, qty: 4 }]);
    expect(c0.gold).toBe(10_000);
    expect(divineUpgradeCost(9).materials[0]!.qty).toBe(40);
    // Total d'un +10 complet : 220 Éclats (~6 j de rente au plafond de 50/j).
    const total = Array.from({ length: 10 }, (_, l) => divineUpgradeCost(l).materials[0]!.qty)
      .reduce((s, q) => s + q, 0);
    expect(total).toBe(220);
  });
  it('exige AUSSI le matériau de zone du craft (même quantité que le renfo ordinaire)', () => {
    const c = divineUpgradeCost(2, 'poussiere_petrifiee');
    expect(c.materials).toContainEqual({ key: ETERNITY_RESOURCE, qty: 12 });
    expect(c.materials).toContainEqual({ key: 'poussiere_petrifiee', qty: 9 }); // 3×(2+1)
  });
});

describe('isDivineItemName', () => {
  it('reconnaît le sceau ✦', () => {
    expect(isDivineItemName('✦ Épée Foudroyante')).toBe(true);
    expect(isDivineItemName('Épée de givre')).toBe(false);
    expect(isDivineItemName(null)).toBe(false);
  });
});
