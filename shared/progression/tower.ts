/**
 * Les Tours (V1.1) : 5 tours SOLO, une par classe (paladin, guerrier, archer,
 * mage, soigneur). Un seul héros de la classe grimpe SA tour. 100 étages =
 * 10 blocs de 10, un bloc par zone : l'étage 10×Z est le « boss » de la zone Z
 * (10 = Forêt … 100 = Trône Astral). Les PV se reportent d'un étage à l'autre
 * (petite regen), la montée s'arrête à la première défaite. Chaque étage paie
 * UNE SEULE FOIS (montée à partir de `meilleur étage + 1`).
 *
 * Difficulté ANCRÉE sur les vrais boss de zone, ramenée au 1v1 (facteur solo),
 * et rendue monotone (une tour ne redevient jamais plus facile). Récompenses :
 * matériau de farm de la zone à chaque étage, et aux paliers de boss (tous les 10)
 * en plus : gemme de la zone (garantie), composant de boss, et matériaux de relique.
 *
 * Fonction PURE et déterministe (rejouable depuis la seed). Aucune I/O.
 */
import { resolveCombat } from '../combat/resolveCombat.ts';
import { withStunImmunity } from '../combat/difficulty.ts';
import type { CombatantInput, CombatResult } from '../combat/types.ts';

/** Classes disposant d'une tour (= toutes les classes du jeu). */
export const TOWER_CLASSES = ['paladin', 'guerrier', 'archer', 'mage', 'soigneur'] as const;
export type TowerClass = (typeof TOWER_CLASSES)[number];

export const FLOORS_PER_ZONE = 10;
/** Étage le plus haut (10 zones × 10 étages) = boss final = zone 10. */
export const TOWER_MAX_FLOOR = 100;
/** PV récupérés entre deux étages, en fraction des PV max (report + regen). */
export const TOWER_REGEN_PCT = 0.3;

/**
 * Facteur SOLO : les boss de zone sont calibrés pour une escouade (5 héros). En
 * tour, un SEUL héros les affronte en 1v1 → on ramène les stats à ~50 %. Ajustable.
 */
export const SOLO_FACTOR = 0.5;

/**
 * Données de zone (miroir des maps en base : boss de fin de zone + ressources).
 * `boss` = stats RÉELLES du boss de zone (escouade) — servent d'ancre de difficulté.
 * `farm` = matériau de la zone ; `bossResource` = composant lâché par le boss ;
 * `gem` = gemme de la zone.
 */
type ZoneDef = {
  zone: number;
  mapId: string;
  farm: string;
  bossResource: string;
  gem: string;
  boss: { hp: number; atk: number; def: number };
};

const ZONES: ZoneDef[] = [
  { zone: 1,  mapId: 'forest',    farm: 'ecorce',           bossResource: 'coeur_sylve',       gem: 'gemme_seve',     boss: { hp: 765,  atk: 27,  def: 18 } },
  { zone: 2,  mapId: 'caverns',   farm: 'cristal',          bossResource: 'givre_pur',         gem: 'gemme_glace',    boss: { hp: 1360, atk: 43,  def: 25 } },
  { zone: 3,  mapId: 'desert',    farm: 'sable_noir',       bossResource: 'oeil_sphinx',       gem: 'gemme_solaire',  boss: { hp: 1275, atk: 60,  def: 23 } },
  { zone: 4,  mapId: 'swamp',     farm: 'spore',            bossResource: 'coeur_hydre',       gem: 'gemme_venin',    boss: { hp: 1600, atk: 75,  def: 28 } },
  { zone: 5,  mapId: 'volcano',   farm: 'obsidienne',       bossResource: 'braise_eternelle',  gem: 'gemme_braise',   boss: { hp: 1925, atk: 90,  def: 33 } },
  { zone: 6,  mapId: 'ruins',     farm: 'rune',             bossResource: 'fragment_titan',    gem: 'gemme_runique',  boss: { hp: 2925, atk: 176, def: 42 } },
  { zone: 7,  mapId: 'abyss',     farm: 'nacre_noire',      bossResource: 'encre_kraken',      gem: 'gemme_abyssale', boss: { hp: 4120, atk: 283, def: 52 } },
  { zone: 8,  mapId: 'sky',       farm: 'plume_orage',      bossResource: 'foudre_condensee',  gem: 'gemme_orage',    boss: { hp: 5510, atk: 410, def: 62 } },
  { zone: 9,  mapId: 'shadow',    farm: 'ombre_pure',       bossResource: 'coeur_ombre',       gem: 'gemme_ombre',    boss: { hp: 7095, atk: 558, def: 74 } },
  { zone: 10, mapId: 'celestial', farm: 'poussiere_etoile', bossResource: 'essence_astrale',   gem: 'gemme_astrale',  boss: { hp: 8875, atk: 726, def: 87 } },
];

/** Zone (1..10) d'un étage : bloc de 10 étages. Étage 1-10 → zone 1, 11-20 → zone 2… */
export function zoneOfFloor(floor: number): number {
  return Math.min(ZONES.length, Math.max(1, Math.ceil(floor / FLOORS_PER_ZONE)));
}

type Stat = { hp: number; atk: number; def: number };

/**
 * Ancres de difficulté par zone = stats du boss × SOLO_FACTOR, rendues MONOTONES
 * (running-max) pour qu'une tour ne redevienne jamais plus facile (le boss du
 * désert a moins de PV que celui des cavernes — on lisse). Précalculé une fois.
 */
const SOLO_ANCHORS: Stat[] = (() => {
  const out: Stat[] = [];
  let hp = 0, atk = 0, def = 0;
  for (const z of ZONES) {
    hp = Math.max(hp, z.boss.hp * SOLO_FACTOR);
    atk = Math.max(atk, z.boss.atk * SOLO_FACTOR);
    def = Math.max(def, z.boss.def * SOLO_FACTOR);
    out.push({ hp, atk, def });
  }
  return out;
})();

/** Ancre de l'étage 0 (base de départ, tour très douce au tout début). */
const SEED_ANCHOR: Stat = { hp: 55, atk: 6, def: 2 };

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Nature d'un étage : boss tous les 10, gardien tous les 5, sinon normal. */
export type TowerFloorKind = 'normal' | 'guardian' | 'boss';

export function towerFloorKind(floor: number): TowerFloorKind {
  if (floor % 10 === 0) return 'boss';
  if (floor % 5 === 0) return 'guardian';
  return 'normal';
}

function towerEnemyName(floor: number, kind: TowerFloorKind): string {
  if (kind === 'boss') return `Gardien du Palier ${floor}`;
  if (kind === 'guardian') return `Sentinelle d'élite (étage ${floor})`;
  return `Gardien de la Tour (étage ${floor})`;
}

/**
 * Ennemi d'un étage. Stats interpolées entre l'ancre de la zone précédente (à
 * l'étage 10×(Z−1)) et celle de la zone courante (à l'étage 10×Z) : chaque bloc
 * de 10 monte progressivement jusqu'au « boss » de la zone. Les boss d'étage sont
 * insensibles au stun (comme les boss de donjon/arc).
 */
export function towerEnemy(floor: number): CombatantInput {
  const z = zoneOfFloor(floor);
  const anchor = SOLO_ANCHORS[z - 1]!;
  const prev = z <= 1 ? SEED_ANCHOR : SOLO_ANCHORS[z - 2]!;
  // Position dans le bloc de la zone : (0,1], = 1 pile sur le palier de boss.
  const t = (floor - (z - 1) * FLOORS_PER_ZONE) / FLOORS_PER_ZONE;
  const kind = towerFloorKind(floor);
  const enemy: CombatantInput = {
    id: `tower-floor-${floor}`,
    name: towerEnemyName(floor, kind),
    role: 'enemy',
    hp: Math.round(lerp(prev.hp, anchor.hp, t)),
    atk: Math.round(lerp(prev.atk, anchor.atk, t)),
    def: Math.round(lerp(prev.def, anchor.def, t)),
    speed: 10 + Math.floor(floor / 10),
  };
  return kind === 'boss' ? withStunImmunity(enemy) : enemy;
}

/* ------------------------------------------------------------- RÉCOMPENSES -- */

/** Matériaux de relique donnés par palier de boss de zone Z (≈ de quoi 1 relique). */
function relicFragmentQty(zone: number): number {
  return 3 + zone * 2; // zone 1 → 5, zone 10 → 23
}
/** Composant de boss donné au palier de boss. */
const BOSS_RESOURCE_QTY = 2;

export type TowerFloorReward = { resource: string; amount: number };

/**
 * Matériau de FARM de base d'un étage (récompense de progression fixe, une fois).
 * Conservé séparément (affichage + rétro-compat) ; le crédit complet passe par
 * `towerFloorResources` (qui ajoute gemme/composant/mats de relique aux paliers).
 */
export function towerFloorReward(floor: number): TowerFloorReward {
  const zd = ZONES[zoneOfFloor(floor) - 1]!;
  return { resource: zd.farm, amount: 2 + floor };
}

/**
 * TOUTES les ressources gagnées en franchissant un étage (agrégées en map
 * ressource→quantité). Étage normal = matériau de farm de la zone. Palier de boss
 * (tous les 10) = EN PLUS : gemme de zone (garantie), composant de boss, et
 * matériaux de relique.
 */
export function towerFloorResources(floor: number): Record<string, number> {
  const z = zoneOfFloor(floor);
  const zd = ZONES[z - 1]!;
  const res: Record<string, number> = {};
  const add = (key: string, qty: number) => {
    if (qty > 0) res[key] = (res[key] ?? 0) + qty;
  };

  const base = towerFloorReward(floor);
  add(base.resource, base.amount);

  if (floor % 10 === 0) {
    add(zd.gem, 1); // gemme de zone garantie
    add(zd.bossResource, BOSS_RESOURCE_QTY); // composant de boss
    add('fragment_relique', relicFragmentQty(z)); // matériaux de relique
    add('sceau_catacombe', 1);
  }
  return res;
}

/* ----------------------------------------------------------------- MONTÉE -- */

/** Résultat d'un combat d'étage (pour le replay). */
export type TowerFightResult = {
  floor: number;
  kind: TowerFloorKind;
  enemyName: string;
  /** PV du héros au DÉBUT de l'étage (après regen inter-étage). */
  hpBefore: { id: string; hp: number; maxHp: number }[];
  combat: CombatResult;
};

export type TowerLootDrop = { resource: string; amount: number };

export type TowerClimbResult = {
  fightResults: TowerFightResult[];
  fromFloor: number;
  reachedFloor: number;
  clearedNew: number;
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

    const self = combat.finalState.find((fs) => fs.side === 'ally' && fs.id === hero.id);
    currentHp = self?.hp ?? 0;

    if (combat.result !== 'win') break; // défaite ou stalemate : la montée s'arrête.

    // Étage franchi : toutes les ressources (une seule fois — cf. fromFloor).
    reachedFloor = floor;
    for (const [resource, amount] of Object.entries(towerFloorResources(floor))) {
      loot.set(resource, (loot.get(resource) ?? 0) + amount);
    }

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
