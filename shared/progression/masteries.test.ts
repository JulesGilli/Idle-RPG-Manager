import { describe, it, expect } from 'vitest';
import {
  forgeLevelInfo,
  craftRarityWeights,
  forgeMasteryXpGain,
  autoForgeUnlocked,
  MAX_FORGE_LEVEL,
  AUTO_FORGE_UNLOCK_LEVEL,
  getMaterialTier,
} from './forge.ts';
import {
  jewelLevelInfo,
  jewelRarityWeights,
  jewelMasteryXpGain,
  autoJewelUnlocked,
  MAX_JEWEL_LEVEL,
  AUTO_JEWEL_UNLOCK_LEVEL,
} from './jewelry.ts';
import {
  relicLevelInfo,
  relicRarityWeights,
  relicMasteryXpGain,
  autoRelicUnlocked,
  MAX_RELIC_LEVEL,
  AUTO_RELIC_UNLOCK_LEVEL,
} from './relic.ts';
import { RARITY_ORDER, type Rarity } from './loot.ts';

/**
 * Les TROIS ateliers de craft (Forge, Joaillerie, Autel) suivent la même
 * logique : une maîtrise par joueur, alimentée à chaque craft, qui améliore les
 * probabilités de rareté. Ces tests garantissent qu'ils ne divergent pas — les
 * reliques ont vécu longtemps sur des % globaux figés, sans maîtrise du tout.
 */

const WORKSHOPS = [
  {
    name: 'forge',
    levelInfo: forgeLevelInfo,
    weights: craftRarityWeights,
    xpGain: forgeMasteryXpGain,
    max: MAX_FORGE_LEVEL,
    autoAt: AUTO_FORGE_UNLOCK_LEVEL,
    autoUnlocked: autoForgeUnlocked,
  },
  {
    name: 'joaillerie',
    levelInfo: jewelLevelInfo,
    weights: jewelRarityWeights,
    xpGain: jewelMasteryXpGain,
    max: MAX_JEWEL_LEVEL,
    autoAt: AUTO_JEWEL_UNLOCK_LEVEL,
    autoUnlocked: autoJewelUnlocked,
  },
  {
    name: 'reliquaire',
    levelInfo: relicLevelInfo,
    weights: relicRarityWeights,
    xpGain: relicMasteryXpGain,
    max: MAX_RELIC_LEVEL,
    autoAt: AUTO_RELIC_UNLOCK_LEVEL,
    autoUnlocked: autoRelicUnlocked,
  },
];

const share = (w: Record<Rarity, number>, r: Rarity): number =>
  w[r] / Object.values(w).reduce((s, x) => s + x, 0);

describe('les trois maîtrises de craft', () => {
  it('partagent le même plafond et la même courbe d’XP', () => {
    for (const w of WORKSHOPS) {
      expect(w.max, w.name).toBe(20);
      expect(w.levelInfo(0).level, w.name).toBe(1);
      expect(w.levelInfo(0).xpForNext, w.name).toBe(120); // 80 + 40×1
    }
  });

  it('atteignent leur niveau max sur la même XP totale', () => {
    const totals = WORKSHOPS.map((w) => {
      let xp = 0;
      while (w.levelInfo(xp).level < w.max) xp += 10;
      return xp;
    });
    expect(new Set(totals).size, `XP max divergentes: ${totals.join(', ')}`).toBe(1);
  });

  it('rapportent la même XP pour un même matériau', () => {
    const mat = getMaterialTier('etoiles')!;
    const gains = WORKSHOPS.map((w) => w.xpGain(mat));
    expect(new Set(gains).size, `gains divergents: ${gains.join(', ')}`).toBe(1);
  });

  it('améliorent tous les hautes raretés en montant, et réduisent les basses', () => {
    for (const w of WORKSHOPS) {
      const novice = w.weights(1);
      const master = w.weights(w.max);
      expect(share(master, 'ultimate'), `${w.name}: ultime`).toBeGreaterThan(share(novice, 'ultimate'));
      expect(share(master, 'advanced'), `${w.name}: avancé`).toBeGreaterThan(share(novice, 'advanced'));
      expect(share(master, 'poor'), `${w.name}: médiocre`).toBeLessThan(share(novice, 'poor'));
    }
  });

  it('progressent de façon monotone du niveau 1 au max', () => {
    for (const w of WORKSHOPS) {
      let prev = -1;
      for (let lvl = 1; lvl <= w.max; lvl++) {
        const ult = share(w.weights(lvl), 'ultimate');
        expect(ult, `${w.name} niv.${lvl}`).toBeGreaterThan(prev);
        prev = ult;
      }
    }
  });

  it('donnent des poids strictement positifs sur toutes les raretés', () => {
    for (const w of WORKSHOPS) {
      for (const lvl of [1, 10, w.max]) {
        for (const r of RARITY_ORDER) {
          expect(w.weights(lvl)[r], `${w.name} niv.${lvl} ${r}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('bornent le niveau hors des valeurs valides', () => {
    for (const w of WORKSHOPS) {
      // Sous 1 et au-delà du max : pas d'extrapolation sauvage des probas.
      expect(share(w.weights(0), 'ultimate'), w.name).toBe(share(w.weights(1), 'ultimate'));
      expect(share(w.weights(w.max + 50), 'ultimate'), w.name).toBe(share(w.weights(w.max), 'ultimate'));
    }
  });

  it('encaissent une XP négative ou absurde sans casser', () => {
    for (const w of WORKSHOPS) {
      expect(w.levelInfo(-500).level, w.name).toBe(1);
      expect(w.levelInfo(999_999_999).level, w.name).toBe(w.max);
    }
  });

  it('débloquent leur auto au MÊME palier, et pas avant', () => {
    const paliers = WORKSHOPS.map((w) => w.autoAt);
    expect(new Set(paliers).size, `paliers divergents: ${paliers.join(', ')}`).toBe(1);
    for (const w of WORKSHOPS) {
      // Le rituel est l'experience du debut : l'auto ne doit pas tomber au niveau 1.
      expect(w.autoAt, w.name).toBeGreaterThan(1);
      expect(w.autoAt, w.name).toBeLessThan(w.max);
      expect(w.autoUnlocked(w.autoAt - 1), w.name).toBe(false);
      expect(w.autoUnlocked(w.autoAt), w.name).toBe(true);
      expect(w.autoUnlocked(w.max), w.name).toBe(true);
    }
  });
});
