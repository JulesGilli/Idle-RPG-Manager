import { describe, expect, it } from 'vitest';
import {
  simulateDungeonRun,
  dungeonCooldownSeconds,
  dungeonCooldownRemaining,
  dungeonCooldownFor,
  dungeonProgressFraction,
  DUNGEON_MIN_COOLDOWN_FRACTION,
  type DungeonType,
  type MonsterTemplate,
  type DungeonFightDef,
} from './dungeon.ts';
import type { CombatantInput } from '../combat/types.ts';

/** Un héros costaud (stats effectives) — bat les mobs triviaux, meurt au boss. */
function hero(id: string, over: Partial<CombatantInput> = {}): CombatantInput {
  return { id, name: id, role: 'dps', hp: 200, atk: 60, def: 20, speed: 30, ...over };
}

/** Un mob trivial par défaut (1 PV), surchargeable. */
function mob(name: string, over: Partial<Omit<MonsterTemplate, 'name'>> = {}): MonsterTemplate {
  return { name, hp: 1, atk: 1, def: 0, speed: 1, ...over };
}

/** Un combat = un groupe d'ennemis. */
function fight(name: string, ...enemies: MonsterTemplate[]): DungeonFightDef {
  return { name, enemies };
}

const OVERWHELMING: Partial<MonsterTemplate> = { hp: 999999, atk: 99999, def: 9999, speed: 999 };

/** Donjon : 2 packs normaux, 1 mini-boss (index 2), 1 boss (index 3). Loot chance = 1. */
function makeDungeon(over: Partial<DungeonType> = {}): DungeonType {
  return {
    id: 'dj_test',
    name: 'Donjon de test',
    tier: 1,
    monsterSequence: [
      fight('Rats', mob('Rat'), mob('Rat')),
      fight('Squelettes', mob('Squelette'), mob('Squelette'), mob('Squelette')),
      fight('Mini-boss', mob('Mini-boss')),
      fight('Boss', mob('Boss', OVERWHELMING)), // one-shot l'équipe
    ],
    regenPctBetweenFights: 0.1,
    minibossIndices: [2],
    bossIndex: 3,
    lootTableNormal: [{ resource: 'os', min: 1, max: 1, chance: 1 }],
    lootTableMiniboss: [{ resource: 'relique_frag', min: 2, max: 2, chance: 1 }],
    lootTableBoss: [{ resource: 'coeur_boss', min: 5, max: 5, chance: 1 }],
    ...over,
  };
}

describe('cooldown de donjon', () => {
  // Étirée sur 8 tiers (passage de 4 à 8 donjons) : mêmes bornes qu'avant,
  // 8 h au T1 et 24 h au dernier — c'est le PAS qui a été divisé, pas la plage.
  it('cooldown par tier : 8 h au T1, 24 h au T8, croissant entre les deux', () => {
    expect(dungeonCooldownSeconds(1)).toBe(8 * 3600);
    expect(dungeonCooldownSeconds(8)).toBe(24 * 3600);
    for (let t = 2; t <= 8; t++) {
      expect(dungeonCooldownSeconds(t)).toBeGreaterThan(dungeonCooldownSeconds(t - 1));
    }
  });

  it('plein juste après un run, nul une fois écoulé, nul si jamais joué', () => {
    const now = 1_000_000_000_000;
    const cd = dungeonCooldownSeconds(2);
    expect(dungeonCooldownRemaining(now, 2, now)).toBe(cd);
    expect(dungeonCooldownRemaining(now - cd * 1000, 2, now)).toBe(0);
    expect(dungeonCooldownRemaining(now - cd * 500, 2, now)).toBeGreaterThan(0);
    expect(dungeonCooldownRemaining(null, 2, now)).toBe(0);
  });
});

describe('simulateDungeonRun', () => {
  it('déterministe : même seed + mêmes inputs → même résultat', () => {
    const squad = [hero('h1'), hero('h2')];
    const dungeon = makeDungeon();
    const a = simulateDungeonRun(12345, squad, dungeon);
    const b = simulateDungeonRun(12345, squad, dungeon);
    expect(a).toEqual(b);
  });

  it('un combat à plusieurs ennemis : tous doivent tomber pour gagner', () => {
    const squad = [hero('h1'), hero('h2')];
    const dungeon = makeDungeon({
      monsterSequence: [fight('Trois squelettes', mob('S1'), mob('S2'), mob('S3'))],
      minibossIndices: [],
      bossIndex: 0,
    });
    const run = simulateDungeonRun(5, squad, dungeon);
    // 3 ennemis (id enemy-0-0/1/2) dans le combat.
    const enemies = run.fightResults[0]!.combat.finalState.filter((f) => f.side === 'enemy');
    expect(enemies).toHaveLength(3);
    expect(run.success).toBe(true);
    expect(run.fightResults[0]!.enemyName).toBe('Trois squelettes');
  });

  it('run complet réussi si le boss est battu → loot boss inclus', () => {
    const squad = [hero('h1'), hero('h2')];
    const dungeon = makeDungeon({
      monsterSequence: [
        fight('Rats', mob('Rat'), mob('Rat')),
        fight('Squelettes', mob('Squelette'), mob('Squelette')),
        fight('Mini-boss', mob('Mini-boss')),
        fight('Boss', mob('Boss')),
      ],
    });
    const run = simulateDungeonRun(777, squad, dungeon);
    expect(run.success).toBe(true);
    expect(run.reachedIndex).toBe(3);
    const resources = Object.fromEntries(run.lootRolled.map((d) => [d.resource, d.amount]));
    expect(resources.coeur_boss).toBe(5);
    expect(resources.relique_frag).toBe(2);
    expect(resources.os).toBe(2); // 2 combats normaux gagnés
  });

  it('loot partiel sur wipe : garde le loot mini-boss, PAS le loot boss', () => {
    const squad = [hero('h1'), hero('h2')];
    const run = simulateDungeonRun(42, squad, makeDungeon());

    expect(run.success).toBe(false);
    expect(run.reachedIndex).toBe(3); // le boss a bien été atteint (et a wipe l'équipe)

    const resources = Object.fromEntries(run.lootRolled.map((d) => [d.resource, d.amount]));
    expect(resources.relique_frag).toBe(2); // mini-boss vaincu → loot gardé
    expect(resources.os).toBe(2); // 2 combats normaux gagnés
    expect(resources.coeur_boss).toBeUndefined(); // boss non vaincu → aucun loot boss
  });

  it('wipe sur le mini-boss : pas de loot mini-boss (non vaincu)', () => {
    const squad = [hero('h1')];
    const dungeon = makeDungeon({
      monsterSequence: [
        fight('Rats', mob('Rat'), mob('Rat')),
        fight('Squelettes', mob('Squelette'), mob('Squelette')),
        fight('Mini-boss', mob('Mini-boss', OVERWHELMING)),
        fight('Boss', mob('Boss')),
      ],
    });
    const run = simulateDungeonRun(9, squad, dungeon);
    expect(run.success).toBe(false);
    expect(run.reachedIndex).toBe(2);
    const resources = Object.fromEntries(run.lootRolled.map((d) => [d.resource, d.amount]));
    expect(resources.os).toBe(2);
    expect(resources.relique_frag).toBeUndefined();
    expect(resources.coeur_boss).toBeUndefined();
  });

  it('regen partielle appliquée entre deux combats (pas de reset à 100 %)', () => {
    // NB : le 1er combat est « normal » → ses stats sont renforcées par le scaling
    // de difficulté (cf. scaleNormalMonster). Fixture calibrée pour que le héros
    // survive blessé (perte > 10 % des PV max, sans mourir) et teste la regen.
    const squad = [hero('h1', { hp: 3000, atk: 150, def: 0 })];
    const dungeon = makeDungeon({
      monsterSequence: [
        fight('Cogneur', mob('Cogneur', { hp: 200, atk: 40, def: 0, speed: 40 })),
        fight('Boss', mob('Boss', { hp: 10, atk: 1, def: 0, speed: 1 })),
      ],
      minibossIndices: [],
      bossIndex: 1,
      regenPctBetweenFights: 0.1,
    });
    const run = simulateDungeonRun(555, squad, dungeon);

    const fight0 = run.fightResults[0]!;
    const fight1 = run.fightResults[1]!;

    const hpAfterFight0 = fight0.combat.finalState.find((f) => f.id === 'h1')!.hp;
    const maxHp = fight0.hpBefore.find((h) => h.id === 'h1')!.maxHp; // 200
    const hpBeforeFight1 = fight1.hpBefore.find((h) => h.id === 'h1')!.hp;

    expect(hpAfterFight0).toBeGreaterThan(0);
    expect(hpAfterFight0).toBeLessThan(maxHp);

    const expected = Math.min(maxHp, hpAfterFight0 + Math.round(maxHp * 0.1));
    expect(hpBeforeFight1).toBe(expected);
    expect(hpBeforeFight1).toBeGreaterThan(hpAfterFight0);
    expect(hpBeforeFight1).toBeLessThan(maxHp);
  });

  it('le 1er combat démarre à PV pleins (aucune regen avant)', () => {
    const squad = [hero('h1', { hp: 180 })];
    const run = simulateDungeonRun(3, squad, makeDungeon());
    const first = run.fightResults[0]!.hpBefore.find((h) => h.id === 'h1')!;
    expect(first.hp).toBe(180);
    expect(first.hp).toBe(first.maxHp);
  });

  it('arc 1 explicite = arc par défaut (rétro-compat stricte)', () => {
    const squad = [hero('h1'), hero('h2')];
    const dungeon = makeDungeon();
    expect(simulateDungeonRun(12345, squad, dungeon, 1)).toEqual(
      simulateDungeonRun(12345, squad, dungeon),
    );
  });

  it('arc 2 : les ennemis sont bien plus coriaces (PV/ATK montés)', () => {
    const squad = [hero('h1')];
    // Un seul combat normal, PV/ATK/DEF de mob non triviaux pour lire le scaling.
    const dungeon = makeDungeon({
      monsterSequence: [fight('Cogneur', mob('Cogneur', { hp: 100, atk: 30, def: 10 }))],
      minibossIndices: [],
      bossIndex: 0,
    });
    const a1 = simulateDungeonRun(7, squad, dungeon, 1);
    const a2 = simulateDungeonRun(7, squad, dungeon, 2);

    const enemyA1 = a1.fightResults[0]!.combat.finalState.find((f) => f.side === 'enemy')!;
    const enemyA2 = a2.fightResults[0]!.combat.finalState.find((f) => f.side === 'enemy')!;

    // PV max de l'ennemi = maxHp du finalState : l'arc 2 doit être NETTEMENT tankier.
    expect(enemyA2.maxHp).toBeGreaterThan(enemyA1.maxHp * 10);
  });
});

describe('cooldown proportionnel à la progression', () => {
  it('un donjon nettoyé coûte le cooldown PLEIN', () => {
    expect(dungeonProgressFraction(4, 5, true)).toBe(1);
    expect(dungeonCooldownFor(3, 1)).toBe(dungeonCooldownSeconds(3));
  });

  it('la moitié du donjon coûte la moitié du cooldown', () => {
    // 2 combats gagnés sur 4 : wipe AU combat d'index 2, donc 2 franchis.
    expect(dungeonProgressFraction(2, 4, false)).toBe(0.5);
    expect(dungeonCooldownFor(4, 0.5)).toBe(Math.round(dungeonCooldownSeconds(4) / 2));
  });

  it('reachedIndex inclut le combat PERDU — pas d’off-by-one en faveur du joueur', () => {
    // Wipe au tout premier combat (index 0) : zéro combat franchi, pas 1.
    expect(dungeonProgressFraction(0, 4, false)).toBe(0);
    // Wipe au boss (index 3 sur 4) : 3 franchis sur 4.
    expect(dungeonProgressFraction(3, 4, false)).toBe(0.75);
  });

  it('un échec total garde un cooldown plancher (pas de relance infinie)', () => {
    const cd = dungeonCooldownFor(1, 0);
    expect(cd).toBe(Math.round(dungeonCooldownSeconds(1) * DUNGEON_MIN_COOLDOWN_FRACTION));
    expect(cd).toBeGreaterThan(0);
  });

  it('ne dépasse jamais le cooldown plein, même sur une entrée aberrante', () => {
    const full = dungeonCooldownSeconds(5);
    expect(dungeonCooldownFor(5, 3)).toBe(full);
    expect(dungeonProgressFraction(99, 4, false)).toBe(1);
    expect(dungeonProgressFraction(-5, 4, false)).toBe(0);
  });

  it('un succès vaut 1 quelles que soient les bornes', () => {
    // La propriété qui doit tenir quoi qu'il arrive à l'arithmétique.
    expect(dungeonProgressFraction(0, 0, true)).toBe(1);
    expect(dungeonProgressFraction(-1, 5, true)).toBe(1);
  });
});
