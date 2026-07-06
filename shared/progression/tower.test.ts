import { describe, expect, it } from 'vitest';
import {
  TOWER_MAX_FLOOR,
  towerFloorKind,
  towerEnemy,
  towerFloorReward,
  simulateTowerClimb,
} from './tower.ts';
import type { CombatantInput } from '../combat/types.ts';

const strongHero: CombatantInput = {
  id: 'h1',
  name: 'Héros',
  role: 'dps',
  hp: 5_000_000,
  atk: 2_000_000,
  def: 5_000,
  speed: 30,
};

const weakHero: CombatantInput = {
  id: 'h1',
  name: 'Bleu',
  role: 'dps',
  hp: 20,
  atk: 1,
  def: 0,
  speed: 5,
};

describe('towerFloorKind', () => {
  it('classe les paliers : boss tous les 10, gardien tous les 5, sinon normal', () => {
    expect(towerFloorKind(1)).toBe('normal');
    expect(towerFloorKind(5)).toBe('guardian');
    expect(towerFloorKind(10)).toBe('boss');
    expect(towerFloorKind(15)).toBe('guardian');
    expect(towerFloorKind(20)).toBe('boss');
  });
});

describe('towerEnemy', () => {
  it('la difficulté monte strictement avec l’étage (à nature égale)', () => {
    // Étages normaux successifs (1 → 2 → 3) : hp/atk croissants.
    expect(towerEnemy(2).hp).toBeGreaterThan(towerEnemy(1).hp);
    expect(towerEnemy(3).atk).toBeGreaterThan(towerEnemy(2).atk);
  });

  it('le boss d’étage est insensible au stun', () => {
    const boss = towerEnemy(10);
    expect(boss.abilities?.some((a) => a.kind === 'immune')).toBe(true);
  });

  it('un gardien est plus coriace qu’un étage normal proche', () => {
    expect(towerEnemy(5).hp).toBeGreaterThan(towerEnemy(4).hp);
  });
});

describe('towerFloorReward', () => {
  it('donne un matériau de base, quantité croissante avec l’étage', () => {
    expect(towerFloorReward(1)).toEqual({ resource: 'ecorce', amount: 3 });
    expect(towerFloorReward(50).amount).toBeGreaterThan(towerFloorReward(1).amount);
  });

  it('les matériaux montent en gamme avec les bandes d’étage', () => {
    expect(towerFloorReward(1).resource).toBe('ecorce'); // bande 1-5
    expect(towerFloorReward(6).resource).toBe('cristal'); // bande 6-10
    expect(towerFloorReward(50).resource).toBe('poussiere_etoile'); // bande 46-50
  });
});

describe('simulateTowerClimb', () => {
  it('un héros surpuissant atteint le sommet et loote chaque étage franchi', () => {
    const run = simulateTowerClimb(123, strongHero, 1);
    expect(run.toppedOut).toBe(true);
    expect(run.reachedFloor).toBe(TOWER_MAX_FLOOR);
    expect(run.clearedNew).toBe(TOWER_MAX_FLOOR);
    // Loot agrégé non vide (matériaux de base de plusieurs bandes).
    expect(run.loot.length).toBeGreaterThan(0);
    expect(run.fightResults).toHaveLength(TOWER_MAX_FLOOR);
  });

  it('repart de `fromFloor` : aucun étage déjà franchi n’est rejoué (pas de double loot)', () => {
    const run = simulateTowerClimb(7, strongHero, 11);
    expect(run.fromFloor).toBe(11);
    expect(run.fightResults[0]!.floor).toBe(11);
    // Aucune récompense d'un étage < 11.
    expect(run.loot.some((d) => d.resource === 'ecorce')).toBe(false);
  });

  it('un héros trop faible échoue au premier étage (aucun étage franchi)', () => {
    const run = simulateTowerClimb(1, weakHero, 1);
    expect(run.clearedNew).toBe(0);
    expect(run.reachedFloor).toBe(0);
    expect(run.loot).toEqual([]);
    expect(run.fightResults).toHaveLength(1);
    expect(run.fightResults[0]!.combat.result).toBe('loss');
  });

  it('déterministe pour une même seed', () => {
    const a = simulateTowerClimb(999, strongHero, 1);
    const b = simulateTowerClimb(999, strongHero, 1);
    expect(a.reachedFloor).toBe(b.reachedFloor);
    expect(a.loot).toEqual(b.loot);
  });
});
