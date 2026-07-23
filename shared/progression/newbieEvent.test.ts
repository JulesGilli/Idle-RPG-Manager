import { describe, expect, it } from 'vitest';
import {
  NEWBIE_OBJECTIVES,
  NEWBIE_MILESTONES,
  NEWBIE_EXPEDITION_TYPES,
  NEWBIE_EXPEDITION_SIGNATURE_RESOURCE,
  NEWBIE_PANTIN_DAYS,
  NEWBIE_TOWER_FLOOR,
  objectiveProgress,
  evaluateObjectives,
  overallPct,
  milestonesReached,
  eventActive,
  resolveRewardZone,
  rewardChoice,
  type NewbieSignals,
  type NewbieObjectiveDef,
} from './newbieEvent.ts';

const EMPTY: NewbieSignals = {
  bossZonesCleared: [],
  dungeonTiersCleared: [],
  expeditionTypesClaimed: [],
  pantinDaysInWindow: 0,
  towerFloorsByWeight: { light: 0, medium: 0, heavy: 0 },
  inGuild: false,
};

const byId = (id: string): NewbieObjectiveDef => NEWBIE_OBJECTIVES.find((o) => o.id === id)!;

describe('liste d’objectifs', () => {
  it('13 objectifs, ids uniques', () => {
    expect(NEWBIE_OBJECTIVES).toHaveLength(13);
    expect(new Set(NEWBIE_OBJECTIVES.map((o) => o.id)).size).toBe(13);
  });
  it('une expédition par type seedé', () => {
    for (const t of NEWBIE_EXPEDITION_TYPES) {
      expect(NEWBIE_OBJECTIVES.some((o) => o.expeditionTypeId === t.id)).toBe(true);
    }
  });
  it('paliers 25/50/75/100 dont le 100 % = héros S', () => {
    expect(NEWBIE_MILESTONES.map((m) => m.pct)).toEqual([25, 50, 75, 100]);
    expect(NEWBIE_MILESTONES.at(-1)!.rewards).toEqual([{ type: 'hero_s_choice' }]);
  });
});

describe('objectiveProgress — zones (checkpoints)', () => {
  it('zone_5 requiert le boss de la zone 5, pas une autre', () => {
    expect(objectiveProgress(byId('zone_5'), { ...EMPTY, bossZonesCleared: [3, 4] }).done).toBe(false);
    expect(objectiveProgress(byId('zone_5'), { ...EMPTY, bossZonesCleared: [5] }).done).toBe(true);
  });
});

describe('objectiveProgress — donjons par tier', () => {
  it('dungeon_4 requiert le tier 4', () => {
    expect(objectiveProgress(byId('dungeon_4'), { ...EMPTY, dungeonTiersCleared: [1, 2, 3] }).done).toBe(false);
    expect(objectiveProgress(byId('dungeon_4'), { ...EMPTY, dungeonTiersCleared: [4] }).done).toBe(true);
  });
});

describe('objectiveProgress — expéditions par type', () => {
  it('exige le bon type', () => {
    const o = byId('expedition_exp_mines_abyssales');
    expect(objectiveProgress(o, { ...EMPTY, expeditionTypesClaimed: ['exp_foret_fossile'] }).done).toBe(false);
    expect(objectiveProgress(o, { ...EMPTY, expeditionTypesClaimed: ['exp_mines_abyssales'] }).done).toBe(true);
  });
});

describe('objectiveProgress — pantin (jours, jauge partielle)', () => {
  it('progresse 0→5 et se termine à 5', () => {
    expect(objectiveProgress(byId('pantin_5days'), { ...EMPTY, pantinDaysInWindow: 3 })).toEqual({
      id: 'pantin_5days', done: false, current: 3, target: NEWBIE_PANTIN_DAYS,
    });
    expect(objectiveProgress(byId('pantin_5days'), { ...EMPTY, pantinDaysInWindow: 5 }).done).toBe(true);
    // borne haute : 7 jours affiche 5/5, pas 7/5.
    expect(objectiveProgress(byId('pantin_5days'), { ...EMPTY, pantinDaysInWindow: 7 }).current).toBe(5);
  });
});

describe('objectiveProgress — tour (les 3 poids, étage min)', () => {
  it('non fait si un seul poids est sous le seuil', () => {
    const s = { ...EMPTY, towerFloorsByWeight: { light: 30, medium: 30, heavy: 29 } };
    const p = objectiveProgress(byId('tower_30'), s);
    expect(p.done).toBe(false);
    expect(p.current).toBe(29); // la jauge suit le poids le plus en retard
  });
  it('fait quand les 3 poids atteignent le seuil', () => {
    const s = { ...EMPTY, towerFloorsByWeight: { light: 45, medium: 30, heavy: 31 } };
    expect(objectiveProgress(byId('tower_30'), s).done).toBe(true);
    expect(objectiveProgress(byId('tower_30'), s).current).toBe(NEWBIE_TOWER_FLOOR);
  });
});

describe('objectiveProgress — guilde', () => {
  it('binaire sur l’appartenance', () => {
    expect(objectiveProgress(byId('guild_join'), EMPTY).done).toBe(false);
    expect(objectiveProgress(byId('guild_join'), { ...EMPTY, inGuild: true }).done).toBe(true);
  });
});

describe('overallPct & milestonesReached', () => {
  it('0 objectif = 0 %, aucun palier', () => {
    const p = evaluateObjectives(EMPTY);
    expect(overallPct(p)).toBe(0);
    expect(milestonesReached(0)).toEqual([]);
  });
  it('tout fait = 100 %, tous les paliers', () => {
    const all: NewbieSignals = {
      bossZonesCleared: [3, 5, 7],
      dungeonTiersCleared: [1, 2, 3, 4],
      expeditionTypesClaimed: NEWBIE_EXPEDITION_TYPES.map((t) => t.id),
      pantinDaysInWindow: 5,
      towerFloorsByWeight: { light: 30, medium: 30, heavy: 30 },
      inGuild: true,
    };
    const p = evaluateObjectives(all);
    expect(p.every((x) => x.done)).toBe(true);
    expect(overallPct(p)).toBe(100);
    expect(milestonesReached(100)).toEqual([25, 50, 75, 100]);
  });
  it('7/13 objectifs ≈ 54 % → paliers 25 et 50 franchis, pas 75', () => {
    const s: NewbieSignals = {
      bossZonesCleared: [3, 5, 7],           // 3
      dungeonTiersCleared: [1, 2],           // 2
      expeditionTypesClaimed: ['exp_foret_fossile', 'exp_ruines_englouties'], // 2
      pantinDaysInWindow: 0,
      towerFloorsByWeight: { light: 0, medium: 0, heavy: 0 },
      inGuild: false,
    };
    const pct = overallPct(evaluateObjectives(s)); // 7/13
    expect(pct).toBe(54);
    expect(milestonesReached(pct)).toEqual([25, 50]);
  });
});

describe('eventActive', () => {
  it('actif dans la fenêtre, inactif avant/après', () => {
    const start = 1_000, end = 2_000;
    expect(eventActive(start, end, 1_500)).toBe(true);
    expect(eventActive(start, end, 999)).toBe(false);
    expect(eventActive(start, end, 2_000)).toBe(false); // borne de fin exclue
  });
});

describe('resolveRewardZone', () => {
  it('zone fixe pour un équipement/relique de zone donnée', () => {
    expect(resolveRewardZone({ type: 'equipment_choice', slots: ['weapon', 'armor'], zone: 6 }, 3)).toBe(6);
    expect(resolveRewardZone({ type: 'relic_choice', zone: 5 }, 9)).toBe(5);
  });
  it('offset = zone la plus loin + offset, plafonné à MAX_ZONE', () => {
    expect(resolveRewardZone({ type: 'equipment_choice', slots: ['weapon'], zoneOffset: 2 }, 5)).toBe(7);
    expect(resolveRewardZone({ type: 'equipment_choice', slots: ['weapon'], zoneOffset: 2 }, 9)).toBe(10); // cap
    expect(resolveRewardZone({ type: 'equipment_choice', slots: ['weapon', 'armor'], zoneOffset: 0 }, 4)).toBe(4);
  });
  it('null pour une récompense sans zone', () => {
    expect(resolveRewardZone({ type: 'gold', amount: 100 }, 5)).toBeNull();
    expect(resolveRewardZone({ type: 'hero_s_choice' }, 5)).toBeNull();
  });
});

describe('rewardChoice', () => {
  it('classe le type de choix requis', () => {
    expect(rewardChoice({ type: 'equipment_choice', slots: ['weapon'], zone: 4 })).toBe('equipment');
    expect(rewardChoice({ type: 'relic_choice', zone: 3 })).toBe('relic');
    expect(rewardChoice({ type: 'hero_s_choice' })).toBe('hero');
    expect(rewardChoice({ type: 'gold', amount: 1 })).toBeNull();
    expect(rewardChoice({ type: 'expedition_resources', qty: 30 })).toBeNull();
  });
});

describe('signature d’expédition', () => {
  it('un matériau par type', () => {
    for (const t of NEWBIE_EXPEDITION_TYPES) {
      expect(NEWBIE_EXPEDITION_SIGNATURE_RESOURCE[t.id]).toBeTruthy();
    }
  });
});
