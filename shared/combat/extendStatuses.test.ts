import { describe, expect, it } from 'vitest';
import { resolveCombat } from './resolveCombat.ts';
import type { Ability, CombatantInput } from './types.ts';

function inq(abilities: Ability[]): CombatantInput {
  return { id: 'inq', name: 'Inquisiteur', role: 'dps', hp: 4000, atk: 60, def: 10, speed: 20, abilities };
}
const foe = (o: Partial<CombatantInput> = {}): CombatantInput => ({
  id: 'e1', name: 'Ennemi', role: 'enemy', hp: 8000, atk: 20, def: 5, speed: 5, ...o,
});

/** Brûle à coup sûr + pose des stacks, puis prolonge tout. */
const BURN: Ability = { kind: 'on_hit', status: 'burn', chance: 1, potency: 0.2, duration: 2 };
const STACK: Ability = { kind: 'stack_on_hit', mark: 'burn', chance: 1, max: 5 };

describe('extend_statuses (mécanique) — prolonge au lieu de consumer', () => {
  it('prolonge les afflictions des ennemis', () => {
    const res = resolveCombat({
      allies: [inq([BURN, { kind: 'autocast', everyRounds: 2, action: { type: 'extend_statuses', turns: 12 } }])],
      enemies: [foe()],
      seed: 4,
    });
    expect(res.events.some((e) => e.type === 'status' && e.message.includes('prolongée(s) de 12 tours'))).toBe(true);
  });

  it('ne consomme PAS les stacks d’embrasement', () => {
    const withExtend = resolveCombat({
      allies: [inq([BURN, STACK, { kind: 'autocast', everyRounds: 2, action: { type: 'extend_statuses', turns: 12 } }])],
      enemies: [foe()],
      seed: 4,
    });
    // L'ancien effet annonçait une explosion ; le nouveau ne doit jamais l'émettre.
    expect(withExtend.events.some((e) => e.type === 'status' && e.message.includes('fait exploser'))).toBe(false);
  });

  it('les afflictions prolongées font MONTER les dégâts totaux', () => {
    // Le porteur du DoT doit CESSER de frapper, sinon la brûlure est réappliquée
    // à chaque coup et ne s'épuise jamais : prolonger sa durée n'y changerait rien.
    // D'où un « brûleur » fragile qui pose la brûlure puis meurt, et un
    // inquisiteur inoffensif (ATK 1) qui ne fait que prolonger.
    const totalDot = (withUlt: boolean) => {
      const brûleur: CombatantInput = {
        id: 'burn', name: 'Brûleur', role: 'dps', hp: 1, atk: 80, def: 0, speed: 30,
        abilities: [BURN],
      };
      const relais = inq(
        withUlt ? [{ kind: 'autocast', everyRounds: 2, action: { type: 'extend_statuses', turns: 12 } }] : [],
      );
      relais.atk = 1;
      const res = resolveCombat({ allies: [brûleur, relais], enemies: [foe({ atk: 500 })], seed: 4 });
      return res.events
        .filter((e) => e.type === 'attack' && e.targetId === 'e1' && e.status === 'burn')
        .reduce((s, e) => s + (e as { damage: number }).damage, 0);
    };
    expect(totalDot(true)).toBeGreaterThan(totalDot(false));
  });
});

/*
 * Le Bûcher sacré n'utilise PLUS `extend_statuses` (il double désormais plafond
 * de cumul et durée — cf. `bucherSacre.test.ts`). Les tests de barème du nœud
 * ont donc été retirés d'ici. Ce qui suit ne teste plus que la MÉCANIQUE
 * `extend_statuses` elle-même, encore présente dans le moteur.
 */

describe('extend_statuses (mécanique) — intensification des DoT', () => {
  /** Brûleur fragile (pose la brûlure puis meurt) + relais qui ne fait qu'amplifier. */
  const scenario = (dotAmp?: number) => {
    const brûleur: CombatantInput = {
      id: 'burn', name: 'Brûleur', role: 'dps', hp: 1, atk: 80, def: 0, speed: 30,
      abilities: [BURN],
    };
    const relais = inq([
      {
        kind: 'autocast',
        everyRounds: 2,
        action: dotAmp === undefined
          ? { type: 'extend_statuses', turns: 12 }
          : { type: 'extend_statuses', turns: 12, dotAmp },
      },
    ]);
    relais.atk = 1;
    return resolveCombat({ allies: [brûleur, relais], enemies: [foe({ atk: 500 })], seed: 4 });
  };
  const dotTotal = (res: ReturnType<typeof resolveCombat>) =>
    res.events
      .filter((e) => e.type === 'attack' && e.targetId === 'e1' && e.status === 'burn')
      .reduce((s, e) => s + (e as { damage: number }).damage, 0);

  it('les DoT intensifiés font plus de dégâts', () => {
    expect(dotTotal(scenario(1))).toBeGreaterThan(dotTotal(scenario()));
  });

  it('l’intensification est ANNONCÉE dans le journal', () => {
    expect(
      scenario(1).events.some((e) => e.type === 'status' && e.message.includes('intensifiée(s)')),
    ).toBe(true);
  });

  it('un même DoT n’est intensifié QU’UNE fois (pas d’emballement)', () => {
    // L'ultime se relance toutes les 2 manches : sans le garde, le DoT doublerait
    // à chaque passage. On vérifie que le gain reste borné par un seul ×2.
    const sans = dotTotal(scenario());
    const avec = dotTotal(scenario(1));
    expect(avec).toBeLessThanOrEqual(sans * 2 + 5);
  });

  it('sans intensification, aucun message d’intensification', () => {
    expect(
      scenario().events.some((e) => e.type === 'status' && e.message.includes('intensifiée')),
    ).toBe(false);
  });
});

