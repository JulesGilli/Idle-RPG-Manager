/**
 * La Tour : une activité SOLO (un seul héros) faite d'étages consécutifs à
 * difficulté croissante. Le héros grimpe étage par étage : les PV se REPORTENT
 * d'un étage à l'autre (petite regen entre chaque), la montée s'arrête à la
 * première défaite. Chaque étage franchi rapporte des MATÉRIAUX DE BASE, mais
 * UNE SEULE FOIS : une montée repart toujours au-dessus du meilleur étage atteint
 * (`fromFloor = meilleur + 1`), donc aucun étage ne paie deux fois. Moyen rapide
 * de récolter des matériaux, borné par la puissance du héros.
 *
 * Fonction PURE et déterministe (mêmes inputs → mêmes outputs), rejouable depuis
 * la seed. Aucune I/O. Réutilise le moteur /shared/combat.
 */
import { resolveCombat } from '../combat/resolveCombat.ts';
import { withStunImmunity } from '../combat/difficulty.ts';
import type { CombatantInput, CombatResult } from '../combat/types.ts';

/** Étage le plus haut de la Tour (sommet = boss final). */
export const TOWER_MAX_FLOOR = 50;

/** PV récupérés entre deux étages, en fraction des PV max (report + regen). */
export const TOWER_REGEN_PCT = 0.3;

/** Stats de l'ennemi de base (étage 1) avant montée en difficulté.
 *  PV et ATK doublés pour durcir la Tour (×2 vie & attaque à tous les étages). */
const BASE_ENEMY = { hp: 110, atk: 22, def: 5, speed: 10 } as const;

/** Nature d'un étage selon sa position (tous les 5 = gardien, tous les 10 = boss). */
export type TowerFloorKind = 'normal' | 'guardian' | 'boss';

export function towerFloorKind(floor: number): TowerFloorKind {
  if (floor % 10 === 0) return 'boss';
  if (floor % 5 === 0) return 'guardian';
  return 'normal';
}

/** Multiplicateur de stats appliqué au palier (gardien/boss plus coriaces). */
const KIND_MULT: Record<TowerFloorKind, { hp: number; atk: number; def: number }> = {
  normal: { hp: 1, atk: 1, def: 1 },
  guardian: { hp: 1.7, atk: 1.3, def: 1.25 },
  boss: { hp: 3, atk: 1.6, def: 1.5 },
};

/** Nom d'ambiance de l'ennemi d'un étage. */
function towerEnemyName(floor: number, kind: TowerFloorKind): string {
  if (kind === 'boss') return `Gardien du Palier ${floor}`;
  if (kind === 'guardian') return `Sentinelle d'élite (étage ${floor})`;
  return `Gardien de la Tour (étage ${floor})`;
}

/**
 * Ennemi d'un étage : stats de base montées géométriquement avec l'étage, puis
 * modulées par la nature du palier. La difficulté croît régulièrement, avec des
 * pics aux étages gardiens (×5) et boss (×10).
 */
export function towerEnemy(floor: number): CombatantInput {
  const kind = towerFloorKind(floor);
  const m = KIND_MULT[kind];
  const f = floor - 1;
  const enemy: CombatantInput = {
    id: `tower-floor-${floor}`,
    name: towerEnemyName(floor, kind),
    role: 'enemy',
    hp: Math.round(BASE_ENEMY.hp * Math.pow(1.16, f) * m.hp),
    atk: Math.round(BASE_ENEMY.atk * Math.pow(1.11, f) * m.atk),
    def: Math.round(BASE_ENEMY.def * Math.pow(1.09, f) * m.def),
    speed: BASE_ENEMY.speed + Math.floor(floor / 6),
  };
  // Les boss d'étage sont insensibles au stun (comme les boss de donjon/arc).
  return kind === 'boss' ? withStunImmunity(enemy) : enemy;
}

/**
 * Matériaux de base gagnés en franchissant un étage — récompense FIXE (pas de
 * RNG), touchée une seule fois par étage. La bande d'étage fixe le type de
 * matériau (de plus en plus rare) ; la quantité croît avec l'étage.
 */
const TOWER_MATERIAL_BANDS = [
  'ecorce', // étages 1-5
  'cristal', // 6-10
  'sable_noir', // 11-15
  'spore', // 16-20
  'obsidienne', // 21-25
  'rune', // 26-30
  'nacre_noire', // 31-35
  'plume_orage', // 36-40
  'ombre_pure', // 41-45
  'poussiere_etoile', // 46-50
] as const;

export type TowerFloorReward = { resource: string; amount: number };

export function towerFloorReward(floor: number): TowerFloorReward {
  const band = Math.min(TOWER_MATERIAL_BANDS.length - 1, Math.floor((floor - 1) / 5));
  return { resource: TOWER_MATERIAL_BANDS[band]!, amount: 2 + floor };
}

/** Résultat d'un combat d'étage (pour le replay). */
export type TowerFightResult = {
  floor: number;
  kind: TowerFloorKind;
  enemyName: string;
  /** PV du héros au DÉBUT de l'étage (après regen inter-étage). */
  hpBefore: { id: string; hp: number; maxHp: number }[];
  combat: CombatResult;
};

/** Une ressource gagnée, agrégée sur la montée. */
export type TowerLootDrop = { resource: string; amount: number };

export type TowerClimbResult = {
  fightResults: TowerFightResult[];
  /** Étage de départ de cette montée (= meilleur précédent + 1). */
  fromFloor: number;
  /** Étage le plus haut FRANCHI (= fromFloor − 1 si échec dès le premier). */
  reachedFloor: number;
  /** Nombre de nouveaux étages franchis lors de cette montée. */
  clearedNew: number;
  /** A-t-on atteint le sommet (boss final battu) ? */
  toppedOut: boolean;
  loot: TowerLootDrop[];
};

/**
 * Simule une montée de la Tour à partir de `fromFloor`, avec un seul héros.
 * @param seed  seed serveur (jamais fournie par le client).
 * @param hero  combattant prêt (stats effectives, `hp` = PV max).
 * @param fromFloor premier étage à tenter (meilleur précédent + 1, ≥ 1).
 */
export function simulateTowerClimb(
  seed: number,
  hero: CombatantInput,
  fromFloor: number,
): TowerClimbResult {
  const fightResults: TowerFightResult[] = [];
  const loot = new Map<string, number>();
  const maxHp = hero.hp;
  let currentHp = hero.hp;
  const start = Math.max(1, Math.floor(fromFloor));
  let reachedFloor = start - 1;
  let combatSeed = seed >>> 0;
  let toppedOut = false;

  for (let floor = start; floor <= TOWER_MAX_FLOOR; floor++) {
    if (currentHp <= 0) break;
    const kind = towerFloorKind(floor);
    const ally: CombatantInput = { ...hero, startHp: currentHp };
    const enemy = towerEnemy(floor);

    combatSeed = (Math.imul(combatSeed, 1664525) + 1013904223) >>> 0;
    const combat = resolveCombat({ allies: [ally], enemies: [enemy], seed: combatSeed });

    fightResults.push({
      floor,
      kind,
      enemyName: enemy.name,
      hpBefore: [{ id: hero.id, hp: currentHp, maxHp }],
      combat,
    });

    // Report des PV de fin de combat sur le héros.
    const self = combat.finalState.find((fs) => fs.side === 'ally' && fs.id === hero.id);
    currentHp = self?.hp ?? 0;

    const cleared = combat.result === 'win';
    if (!cleared) break; // défaite ou stalemate : la montée s'arrête.

    // Étage franchi : récompense (une seule fois — cf. fromFloor) + avancement.
    reachedFloor = floor;
    const reward = towerFloorReward(floor);
    loot.set(reward.resource, (loot.get(reward.resource) ?? 0) + reward.amount);

    if (floor === TOWER_MAX_FLOOR) {
      toppedOut = true;
      break;
    }

    // Regen partielle avant l'étage suivant (report + regen).
    if (currentHp > 0 && currentHp < maxHp) {
      currentHp = Math.min(maxHp, currentHp + Math.round(maxHp * TOWER_REGEN_PCT));
    }
  }

  return {
    fightResults,
    fromFloor: start,
    reachedFloor,
    clearedNew: Math.max(0, reachedFloor - (start - 1)),
    toppedOut,
    loot: [...loot.entries()].map(([resource, amount]) => ({ resource, amount })),
  };
}
