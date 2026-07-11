/**
 * Runners : rejouent le VRAI moteur (`resolveCombat`) sur les zones (escouade +
 * probe solo) et la Tour (solo par classe), pour chaque profil de stuff.
 *
 * La difficulte est appliquee comme en prod (deployment.ts) : niveaux normaux
 * renforces via `scaleNormalMonster`, boss rendus insensibles au stun via
 * `withStunImmunity`. Les combats sont deterministes (seeds fixes).
 */
import { resolveCombat } from '../shared/combat/resolveCombat.ts';
import { scaleNormalMonster, withStunImmunity } from '../shared/combat/difficulty.ts';
import { simulateTowerClimb, zoneOfFloor } from '../shared/progression/tower.ts';
import type { CombatantInput, CombatResult } from '../shared/combat/types.ts';
import {
  BASE_SEED,
  CLASSES,
  GEAR_PROFILES,
  levelForZone,
  SEEDS_PER_SCENARIO,
  SQUAD_COMP,
  type ClassId,
  type GearProfile,
} from './config.ts';
import { buildHero } from './hero.ts';
import { campaignBuild, setBuild } from './builds.ts';
import type { EnemyDef, GameData, LevelRow } from './loadData.ts';
import { levelsByMap } from './loadData.ts';

/* ------------------------------------------------------------- AGGREGATION -- */

export type LevelStats = {
  levelId: string;
  levelName: string;
  levelIndex: number;
  difficulty: number;
  isBoss: boolean;
  fights: number;
  winRate: number;
  avgRounds: number;
  avgAllyHpPctOnWin: number; // PV moyens restants (%) de l'escouade quand elle gagne
  perAlly: Record<string, { dmgShare: number; survival: number }>; // part de degats, taux de survie
};

function enemyToCombatant(e: EnemyDef, idx: number): CombatantInput {
  return {
    id: `e${idx}`,
    name: e.name,
    role: 'enemy',
    hp: e.hp,
    atk: e.atk,
    def: e.def,
    speed: e.speed,
    armor: e.armor,
    abilities: e.abilities,
  };
}

/** Ennemis d'un niveau, "tunes" comme en prod (scaling normal / boss). */
function tunedEnemies(level: LevelRow): CombatantInput[] {
  const base = level.enemy_config.enemies.map(enemyToCombatant);
  return level.is_boss ? base.map(withStunImmunity) : base.map(scaleNormalMonster);
}

/** Somme des degats infliges par chaque allie (attribution sourceId ?? actorId). */
function damageByAlly(combat: CombatResult, allyIds: Set<string>): Map<string, number> {
  const dmg = new Map<string, number>();
  for (const ev of combat.events) {
    if (ev.type !== 'attack') continue;
    const src = ev.sourceId ?? ev.actorId;
    if (!allyIds.has(src)) continue; // seuls les degats d'allies
    if (allyIds.has(ev.targetId)) continue; // ignore friendly-fire eventuel
    dmg.set(src, (dmg.get(src) ?? 0) + ev.damage);
  }
  return dmg;
}

/** Rejoue un niveau sur N seeds et agrege les stats. */
export function runLevel(allies: CombatantInput[], level: LevelRow): LevelStats {
  const enemies = tunedEnemies(level);
  const allyIds = new Set(allies.map((a) => a.id));
  let wins = 0;
  let roundsSum = 0;
  let hpPctSumOnWin = 0;
  const dmgSum = new Map<string, number>();
  const surviveCount = new Map<string, number>();

  for (let i = 0; i < SEEDS_PER_SCENARIO; i++) {
    const seed = (BASE_SEED + i * 2654435761) >>> 0;
    const combat = resolveCombat({ allies, enemies, seed });
    roundsSum += combat.rounds;

    const allyStates = combat.finalState.filter((f) => f.side === 'ally');
    for (const s of allyStates) {
      if (s.alive) surviveCount.set(s.id, (surviveCount.get(s.id) ?? 0) + 1);
    }
    const perAllyDmg = damageByAlly(combat, allyIds);
    for (const [id, d] of perAllyDmg) dmgSum.set(id, (dmgSum.get(id) ?? 0) + d);

    if (combat.result === 'win') {
      wins++;
      const totHp = allyStates.reduce((s, f) => s + Math.max(0, f.hp), 0);
      const totMax = allyStates.reduce((s, f) => s + f.maxHp, 0);
      hpPctSumOnWin += totMax > 0 ? totHp / totMax : 0;
    }
  }

  const totalDmg = [...dmgSum.values()].reduce((s, d) => s + d, 0) || 1;
  const perAlly: LevelStats['perAlly'] = {};
  for (const a of allies) {
    perAlly[a.id] = {
      dmgShare: (dmgSum.get(a.id) ?? 0) / totalDmg,
      survival: (surviveCount.get(a.id) ?? 0) / SEEDS_PER_SCENARIO,
    };
  }

  return {
    levelId: level.id,
    levelName: level.name,
    levelIndex: level.level_index,
    difficulty: level.difficulty,
    isBoss: level.is_boss,
    fights: SEEDS_PER_SCENARIO,
    winRate: wins / SEEDS_PER_SCENARIO,
    avgRounds: roundsSum / SEEDS_PER_SCENARIO,
    avgAllyHpPctOnWin: wins > 0 ? hpPctSumOnWin / wins : 0,
    perAlly,
  };
}

/* ------------------------------------------------------------------ ZONES -- */

export type ZoneSquadRun = {
  profile: string; // 'under' | 'on' | 'over' | 'set' (build de campagne skills+sets)
  mapId: string;
  mapName: string;
  zone: number;
  heroLevel: number;
  squad: { id: string; classId: ClassId; power: { hp: number; atk: number; def: number } }[];
  levels: LevelStats[];
};

export function runZonesSquad(data: GameData): ZoneSquadRun[] {
  const byMap = levelsByMap(data);
  const out: ZoneSquadRun[] = [];

  for (const map of data.maps) {
    const zone = map.sort;
    const levels = byMap.get(map.id) ?? [];
    for (const profile of GEAR_PROFILES) {
      const squad: CombatantInput[] = SQUAD_COMP.map((classId, i) => {
        const cls = data.heroClasses[classId]!;
        return buildHero(cls, classId, zone, profile, { tag: String(i) });
      });
      out.push({
        profile: profile.id,
        mapId: map.id,
        mapName: map.name,
        zone,
        heroLevel: levelForZone(zone),
        squad: squad.map((c, i) => ({
          id: c.id,
          classId: SQUAD_COMP[i]!,
          power: { hp: c.hp, atk: c.atk, def: c.def },
        })),
        levels: levels.map((l) => runLevel(squad, l)),
      });
    }
  }
  return out;
}

/**
 * Sweep CAMPAGNE : escouade "realiste" = build de branche (skills) + set de
 * campagne 4 pieces, materiau de la zone. C'est pour ca que la difficulte est
 * calibree. A comparer au sweep forge sans skills (l'ecart = ce qu'apportent
 * skills + sets).
 */
export function runZonesSetBuild(data: GameData): ZoneSquadRun[] {
  const byMap = levelsByMap(data);
  const out: ZoneSquadRun[] = [];
  for (const map of data.maps) {
    const zone = map.sort;
    const levels = byMap.get(map.id) ?? [];
    const squad: CombatantInput[] = SQUAD_COMP.map((classId, i) => {
      const cls = data.heroClasses[classId]!;
      const b = campaignBuild(classId);
      const sb = setBuild(classId, zone);
      return buildHero(cls, classId, zone, GEAR_PROFILES[1]!, {
        level: levelForZone(zone),
        learned: b.learned,
        loadout: { activeId: b.activeId, ultimateId: b.ultimateId },
        setIds: sb.setIds,
        gearOverride: sb.bonuses,
        tag: String(i),
      });
    });
    out.push({
      profile: 'set',
      mapId: map.id,
      mapName: map.name,
      zone,
      heroLevel: levelForZone(zone),
      squad: squad.map((c, i) => ({ id: c.id, classId: SQUAD_COMP[i]!, power: { hp: c.hp, atk: c.atk, def: c.def } })),
      levels: levels.map((l) => runLevel(squad, l)),
    });
  }
  return out;
}

/** Probe SOLO : chaque classe seule traverse les niveaux d'une zone (angle "puissance brute de classe"). */
export type ZoneSoloRun = {
  profile: GearProfile['id'];
  classId: ClassId;
  mapId: string;
  zone: number;
  levels: LevelStats[];
};

export function runZonesSolo(data: GameData): ZoneSoloRun[] {
  const byMap = levelsByMap(data);
  const out: ZoneSoloRun[] = [];
  for (const map of data.maps) {
    const zone = map.sort;
    const levels = byMap.get(map.id) ?? [];
    for (const profile of GEAR_PROFILES) {
      for (const classId of CLASSES) {
        const cls = data.heroClasses[classId]!;
        const hero = buildHero(cls, classId, zone, profile);
        out.push({
          profile: profile.id,
          classId,
          mapId: map.id,
          zone,
          levels: levels.map((l) => runLevel([hero], l)),
        });
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------- TOUR -- */

export type TowerRun = {
  profile: GearProfile['id'];
  classId: ClassId;
  reachedFloor: number; // etage max atteint (moyenne sur seeds, arrondie)
  reachedFloorMin: number;
  reachedFloorMax: number;
  zoneReached: number; // zone correspondant a l'etage moyen
};

/** Chaque classe grimpe SA tour (solo), pour chaque profil. Stuff calibre sur la zone de l'etage. */
export function runTower(data: GameData): TowerRun[] {
  const out: TowerRun[] = [];
  const TOWER_SEEDS = 12;
  for (const profile of GEAR_PROFILES) {
    for (const classId of CLASSES) {
      const cls = data.heroClasses[classId]!;
      // Le heros de tour est equipe "pour la zone 10" (endgame) : on mesure jusqu'ou il monte.
      const hero = buildHero(cls, classId, 10, profile);
      const reached: number[] = [];
      for (let i = 0; i < TOWER_SEEDS; i++) {
        const seed = (BASE_SEED + i * 40503) >>> 0;
        const res = simulateTowerClimb(seed, hero, 1);
        reached.push(res.reachedFloor);
      }
      const avg = Math.round(reached.reduce((s, r) => s + r, 0) / reached.length);
      out.push({
        profile: profile.id,
        classId,
        reachedFloor: avg,
        reachedFloorMin: Math.min(...reached),
        reachedFloorMax: Math.max(...reached),
        zoneReached: zoneOfFloor(Math.max(1, avg)),
      });
    }
  }
  return out;
}
