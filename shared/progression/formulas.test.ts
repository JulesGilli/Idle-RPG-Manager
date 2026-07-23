import { describe, expect, it } from 'vitest';
import { effectiveStats, statBreakdown, displayHp, HERO_HP_SCALE } from './formulas.ts';

describe('statBreakdown', () => {
  it('base + alloc + gear == effectiveStats, EXACTEMENT, sur les 4 stats', () => {
    const base = { hp: 100, atk: 15, def: 8, speed: 8 };
    const bonuses = { hp: 40, atk: 12, def: 5 };
    const alloc = { hp: 3, atk: 2, def: 1, speed: 4 };
    const level = 12;

    const stats = effectiveStats(base, level, bonuses, alloc);
    const bd = statBreakdown(base, level, bonuses, alloc);

    for (const key of ['hp', 'atk', 'def', 'speed'] as const) {
      const sum = bd[key].base + bd[key].alloc + bd[key].gear;
      expect(sum).toBe(stats[key]);
    }
  });

  it('sans bonus ni alloc, tout vient de "base" et les deux autres sont nuls', () => {
    const base = { hp: 100, atk: 15, def: 8, speed: 8 };
    const bd = statBreakdown(base, 5, { hp: 0, atk: 0, def: 0 }, { hp: 0, atk: 0, def: 0, speed: 0 });
    for (const key of ['hp', 'atk', 'def', 'speed'] as const) {
      expect(bd[key].alloc).toBe(0);
      expect(bd[key].gear).toBe(0);
      expect(bd[key].base).toBe(effectiveStats(base, 5)[key]);
    }
  });

  it('la vitesse ne reçoit jamais de bonus d’équipement (gear = 0)', () => {
    const base = { hp: 100, atk: 15, def: 8, speed: 8 };
    const bd = statBreakdown(base, 1, { hp: 0, atk: 0, def: 0 }, { hp: 0, atk: 0, def: 0, speed: 10 });
    expect(bd.speed.gear).toBe(0);
    expect(bd.speed.alloc).toBeGreaterThan(0);
  });

  it('le bonus de PV est mis à l’échelle par HERO_HP_SCALE, comme effectiveStats', () => {
    const base = { hp: 100, atk: 15, def: 8, speed: 8 };
    const withGear = statBreakdown(base, 1, { hp: 50, atk: 0, def: 0 }, { hp: 0, atk: 0, def: 0, speed: 0 });
    const withoutGear = statBreakdown(base, 1, { hp: 0, atk: 0, def: 0 }, { hp: 0, atk: 0, def: 0, speed: 0 });
    // 50 de bonus brut × HERO_HP_SCALE (4) = 200 de PV affichés en plus.
    expect(withGear.hp.gear - withoutGear.hp.gear).toBe(200);
  });
});

describe('displayHp', () => {
  it('affiche les PV d’un item en valeur EFFECTIVE (×HERO_HP_SCALE)', () => {
    // Le bug : la carte annonçait le PV brut (ex. 576) alors que le héros en
    // gagne ×4. `displayHp` réconcilie « affiché = accordé ».
    expect(displayHp(576)).toBe(576 * HERO_HP_SCALE);
    expect(displayHp(0)).toBe(0);
    // Cohérent avec le gear de statBreakdown (même facteur).
    const withGear = statBreakdown({ hp: 100, atk: 15, def: 8, speed: 8 }, 1, { hp: 150, atk: 0, def: 0 }, { hp: 0, atk: 0, def: 0, speed: 0 });
    const withoutGear = statBreakdown({ hp: 100, atk: 15, def: 8, speed: 8 }, 1, { hp: 0, atk: 0, def: 0 }, { hp: 0, atk: 0, def: 0, speed: 0 });
    expect(withGear.hp.gear - withoutGear.hp.gear).toBe(displayHp(150));
  });
});
