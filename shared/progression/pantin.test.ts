import { describe, expect, it } from 'vitest';
import { PANTIN_ROUNDS, buildPantin, pantinScore, pantinReward, PANTIN_GOLD_MIN } from './pantin.ts';
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
  it('1 dégât = 1 or', () => {
    expect(pantinReward(12_000).gold).toBe(12_000);
    expect(pantinReward(30_082).gold).toBe(30_082);
    expect(pantinReward(1_000_000).gold).toBe(1_000_000);
  });

  it('garde un plancher pour ne jamais repartir les mains vides', () => {
    expect(pantinReward(0).gold).toBe(PANTIN_GOLD_MIN);
    expect(pantinReward(120).gold).toBe(PANTIN_GOLD_MIN); // sous le plancher
  });

  it("n'est plus plafonné : la récompense suit la progression", () => {
    // L'ancien barème bloquait à 30 000 ; un gros score doit désormais payer plus.
    expect(pantinReward(500_000).gold).toBeGreaterThan(30_000);
  });

  it('reste monotone (jamais moins d’or pour plus de dégâts)', () => {
    const scores = [0, 500, 5_000, 20_000, 100_000];
    const golds = scores.map((s) => pantinReward(s).gold);
    expect(golds).toEqual([...golds].sort((a, b) => a - b));
  });
});
