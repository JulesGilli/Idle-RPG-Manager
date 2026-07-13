import { describe, expect, it } from 'vitest';
import { PANTIN_ROUNDS, buildPantin, pantinScore, pantinReward, PANTIN_GOLD_MIN, PANTIN_GOLD_MAX } from './pantin.ts';
import { resolveCombat } from '../combat/resolveCombat.ts';
import type { CombatantInput } from '../combat/types.ts';

const attacker = (atk: number): CombatantInput => ({
  id: 'dps',
  name: 'DPS',
  role: 'dps',
  hp: 500,
  atk,
  def: 0,
  speed: 10,
});

describe('pantin — combat d’entraînement', () => {
  it('le pantin ne meurt pas et ne riposte pas : le combat va jusqu’à 50 tours', () => {
    const res = resolveCombat({
      allies: [attacker(100)],
      enemies: [buildPantin()],
      seed: 1,
      maxRounds: PANTIN_ROUNDS,
    });
    // Personne côté allié ne meurt (pantin à 0 ATK) et le pantin survit.
    const dps = res.finalState.find((c) => c.id === 'dps')!;
    const pantin = res.finalState.find((c) => c.id === 'pantin')!;
    expect(dps.alive).toBe(true);
    expect(pantin.alive).toBe(true);
    expect(res.rounds).toBe(PANTIN_ROUNDS);
  });

  it('le score = dégâts infligés au pantin, et grimpe avec l’ATK', () => {
    const score = (atk: number) =>
      pantinScore(
        resolveCombat({ allies: [attacker(atk)], enemies: [buildPantin()], seed: 1, maxRounds: PANTIN_ROUNDS }).finalState,
      );
    expect(score(100)).toBeGreaterThan(0);
    expect(score(300)).toBeGreaterThan(score(100));
  });
});

describe('pantinReward', () => {
  it('or proportionnel au score, borné [min, max]', () => {
    expect(pantinReward(0).gold).toBe(PANTIN_GOLD_MIN); // plancher
    expect(pantinReward(100_000).gold).toBe(1000); // 100k × 0.01 = 1000, dans la fourchette
    expect(pantinReward(1_000_000).gold).toBe(10_000); // 1M × 0.01 = 10k
    expect(pantinReward(5_000_000).gold).toBe(PANTIN_GOLD_MAX); // 50k → plafonné à 30k
  });
});
