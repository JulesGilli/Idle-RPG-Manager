import { describe, expect, it } from 'vitest';
import {
  canChallenge,
  arenaRanksAfterChallenge,
  isoWeekKey,
  arenaWeeklyReward,
  arenaRewardZone,
  arenaRewardEligible,
  ARENA_REWARD_QTY_MULT,
  MAX_ZONE,
} from './arena.ts';

describe('arène PvP', () => {
  it('tout le monde peut défier tout le monde, sauf soi-même', () => {
    expect(canChallenge(10, 9)).toBe(true); // au-dessus
    expect(canChallenge(10, 11)).toBe(true); // en dessous : permis désormais
    expect(canChallenge(10, 1)).toBe(true); // très loin : permis
    expect(canChallenge(10, 10)).toBe(false); // soi-même (rang identique)
  });

  it('on ne grimpe qu’en battant MIEUX classé ; sinon rien ne bouge', () => {
    // Bat un mieux classé (rang plus petit) → échange de places.
    expect(arenaRanksAfterChallenge(8, 3, true)).toEqual({ challenger: 3, defender: 8 });
    // Bat un moins bien classé → aucun changement (« reste à sa place »).
    expect(arenaRanksAfterChallenge(3, 8, true)).toEqual({ challenger: 3, defender: 8 });
    // Perd contre un mieux classé → aucun changement.
    expect(arenaRanksAfterChallenge(8, 3, false)).toEqual({ challenger: 8, defender: 3 });
    // Perd contre un moins bien classé → aucun changement.
    expect(arenaRanksAfterChallenge(3, 8, false)).toEqual({ challenger: 3, defender: 8 });
  });

  it('le 1er qui défie plus bas et gagne reste 1er', () => {
    expect(arenaRanksAfterChallenge(1, 7, true)).toEqual({ challenger: 1, defender: 7 });
  });

  it('semaine ISO', () => {
    expect(isoWeekKey('2026-07-07')).toBe('2026-W28');
    expect(isoWeekKey('2026-01-01')).toBe('2026-W01');
    // Deux jours de la même semaine ISO donnent la même clé.
    expect(isoWeekKey('2026-07-06')).toBe(isoWeekKey('2026-07-07'));
  });

  it('récompense hebdo : croît avec les participants, décroît avec le rang', () => {
    expect(arenaWeeklyReward(1, 0, 'z').gold).toBe(0);
    const top50 = arenaWeeklyReward(1, 50, 'z').gold;
    const top10 = arenaWeeklyReward(1, 10, 'z').gold;
    expect(top50).toBeGreaterThan(top10); // plus de participants → plus d'or
    const first = arenaWeeklyReward(1, 20, 'z').gold;
    const tenth = arenaWeeklyReward(10, 20, 'z').gold;
    expect(first).toBeGreaterThan(tenth); // meilleur rang → plus d'or
    expect(arenaWeeklyReward(1, 20, 'z').materials.length).toBeGreaterThan(0);
  });

  it('tout le top 10 reçoit la ressource de la zone au-dessus (la même clé)', () => {
    // Plus de « zone du dessous » pour les rangs 4-10 : chacun gagne le cran
    // au-dessus de SA progression, quantité en baisse avec le rang.
    for (const rank of [1, 3, 4, 10]) {
      const r = arenaWeeklyReward(rank, 20, 'zone_ref');
      expect(r.materials[0]!.key, `rang ${rank}`).toBe('zone_ref');
    }
    expect(arenaWeeklyReward(11, 20, 'zone_ref').materials).toHaveLength(0); // hors top 10
  });

  it('les ressources sont multipliées par ×10', () => {
    expect(ARENA_REWARD_QTY_MULT).toBe(10);
    expect(arenaWeeklyReward(1, 20, 'z').materials[0]!.qty).toBe(20 * ARENA_REWARD_QTY_MULT); // 200
    expect(arenaWeeklyReward(5, 20, 'z').materials[0]!.qty).toBe(10 * ARENA_REWARD_QTY_MULT); // 100
  });
});

describe('Arène — zone de référence du butin', () => {
  it('donne la zone du JOUEUR +1', () => {
    expect(arenaRewardZone(5)).toBe(6);
    expect(arenaRewardZone(1)).toBe(2);
  });

  it('ne dépasse jamais la zone 10', () => {
    expect(arenaRewardZone(10)).toBe(MAX_ZONE);
    expect(arenaRewardZone(99)).toBe(MAX_ZONE);
  });

  it('reste sain sur une zone absente ou nulle', () => {
    expect(arenaRewardZone(0)).toBe(2);
    expect(arenaRewardZone(-3)).toBe(2);
  });

  it('un joueur zone 4 reçoit du zone 5, pas le matériau de fin de jeu du leader', () => {
    // Le cas visé : un joueur zone 4 est récompensé selon SA progression.
    const zone = arenaRewardZone(4);
    expect(zone).toBe(5);
    const reward = arenaWeeklyReward(5, 20, `farm_z${zone}`);
    expect(reward.materials[0]!.key).toBe('farm_z5');
  });
});

describe('Arène — éligibilité à la récompense', () => {
  it('exige au moins un combat disputé', () => {
    expect(arenaRewardEligible(0, 0)).toBe(false); // inscrit, jamais joué
    expect(arenaRewardEligible(1, 0)).toBe(true);
    expect(arenaRewardEligible(0, 1)).toBe(true); // une défaite compte aussi
    expect(arenaRewardEligible(3, 2)).toBe(true);
  });
});
