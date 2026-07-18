/**
 * Les Tours : 3 tours SOLO, une par POIDS d'équipement (léger / moyen / lourd).
 * Un seul héros grimpe la tour de son poids. Découpage par poids et non par
 * classe : la correspondance classe → poids est totale (cf. `weightOfClass`),
 * donc TOUTE classe a une tour — y compris les classes ajoutées après coup, que
 * l'ancien découpage par classe laissait sans tour.
 *
 * 100 étages = 10 blocs de 10, un bloc par zone : l'étage 10×Z est le « boss »
 * de la zone Z (10 = Forêt … 100 = Trône Astral). Chaque étage est un combat
 * INDÉPENDANT (le héros repart à PV pleins, cf. `simulateTowerClimb`), la montée
 * s'arrête à la première défaite. Chaque étage paie UNE SEULE FOIS (montée à
 * partir de `meilleur étage + 1`).
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
import { scaleEnemyStatsForArc } from './arc.ts';
import type { CombatantInput, CombatResult } from '../combat/types.ts';

/** Les trois tours, indexées par poids d'équipement. */
export const TOWER_WEIGHTS = ['light', 'medium', 'heavy'] as const;
export type TowerWeight = (typeof TOWER_WEIGHTS)[number];

export const FLOORS_PER_ZONE = 10;
/** Étage le plus haut (10 zones × 10 étages) = boss final = zone 10. */
export const TOWER_MAX_FLOOR = 100;

/**
 * Facteur SOLO : les boss de zone sont calibrés pour une escouade (5 héros). En
 * tour, un SEUL héros les affronte en 1v1 → on ramène les stats à ~50 %. Ajustable.
 */
export const SOLO_FACTOR = 0.5;

/**
 * DURCISSEMENT V1.1 — depuis que chaque étage se joue à PV PLEINS (plus d'usure
 * entre combats), la Tour est devenue trop douce : on remonte PV et ATK des
 * ennemis de tous les étages. Multiplicateurs appliqués APRÈS l'interpolation
 * (donc aussi sur les étages du début). Seuls knobs à toucher pour re-régler.
 * DEF intacte : la gonfler ferait des combats nuls (stalemate) au lieu de plus durs.
 */
export const TOWER_HP_MULT = 1.6;
export const TOWER_ATK_MULT = 1.45;

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
  { zone: 6,  mapId: 'ruins',     farm: 'rune',             bossResource: 'fragment_titan',    gem: 'gemme_runique',  boss: { hp: 2400, atk: 125, def: 38 } },
  { zone: 7,  mapId: 'abyss',     farm: 'nacre_noire',      bossResource: 'encre_kraken',      gem: 'gemme_abyssale', boss: { hp: 3500, atk: 205, def: 48 } },
  { zone: 8,  mapId: 'sky',       farm: 'plume_orage',      bossResource: 'foudre_condensee',  gem: 'gemme_orage',    boss: { hp: 4900, atk: 310, def: 58 } },
  { zone: 9,  mapId: 'shadow',    farm: 'ombre_pure',       bossResource: 'coeur_ombre',       gem: 'gemme_ombre',    boss: { hp: 6300, atk: 440, def: 70 } },
  { zone: 10, mapId: 'celestial', farm: 'poussiere_etoile', bossResource: 'essence_astrale',   gem: 'gemme_astrale',  boss: { hp: 7900, atk: 590, def: 82 } },
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
    hp: Math.round(lerp(prev.hp, anchor.hp, t) * TOWER_HP_MULT),
    atk: Math.round(lerp(prev.atk, anchor.atk, t) * TOWER_ATK_MULT),
    def: Math.round(lerp(prev.def, anchor.def, t)),
    speed: 10 + Math.floor(floor / 10),
  };
  return kind === 'boss' ? withStunImmunity(enemy) : enemy;
}

/* ------------------------------------------------------------- RÉCOMPENSES -- */

/** Composant de boss donné au palier de boss (volontairement rare : 1/palier). */
const BOSS_RESOURCE_QTY = 1;

/** Quantité basique la plus faible (étage 1) et la plus haute (étage 100). */
const BASE_QTY_MIN = 3;
const BASE_QTY_MAX = 10;

export type TowerFloorReward = { resource: string; amount: number };

/**
 * Matériau de FARM de base d'un étage (récompense de progression fixe, une fois).
 * Quantité volontairement faible : {@link BASE_QTY_MIN} (étage 1) →
 * {@link BASE_QTY_MAX} (étage 100), interpolée. Le crédit complet passe par
 * `towerFloorResources` (qui ajoute gemme + composant de boss aux paliers).
 */
export function towerFloorReward(floor: number): TowerFloorReward {
  const zd = ZONES[zoneOfFloor(floor) - 1]!;
  const f = Math.max(1, Math.min(TOWER_MAX_FLOOR, floor));
  const amount = Math.round(
    BASE_QTY_MIN + ((f - 1) * (BASE_QTY_MAX - BASE_QTY_MIN)) / (TOWER_MAX_FLOOR - 1),
  );
  return { resource: zd.farm, amount };
}

/**
 * TOUTES les ressources gagnées en franchissant un étage (agrégées en map
 * ressource→quantité). Étage normal = matériau de farm de la zone. Palier de boss
 * (tous les 10) = EN PLUS : 1 gemme de zone (garantie) + le composant de boss.
 * AUCUN matériau de donjon (fragment_relique, sceau_catacombe) ni d'expédition :
 * la Tour ne farme que ses propres ressources (mats de zone, gemmes, composants).
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
    add(zd.gem, 1); // 1 gemme de zone garantie
    add(zd.bossResource, BOSS_RESOURCE_QTY); // composant de boss
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
 * @param arc  arc courant (New Game+) : les ennemis voient leur PV/ATK scalés
 *             pour cet arc. Arc 1 = référence (stats inchangées).
 */
export function simulateTowerClimb(
  seed: number,
  hero: CombatantInput,
  fromFloor: number,
  arc = 1,
): TowerClimbResult {
  const fightResults: TowerFightResult[] = [];
  const loot = new Map<string, number>();
  const maxHp = hero.hp;
  const start = Math.max(1, Math.floor(fromFloor));
  let reachedFloor = start - 1;
  let combatSeed = seed >>> 0;
  let toppedOut = false;

  for (let floor = start; floor <= TOWER_MAX_FLOOR; floor++) {
    const kind = towerFloorKind(floor);
    // Chaque étage est un combat INDÉPENDANT : le héros repart à PV PLEINS (régen
    // complète entre deux combats). La Tour n'est PAS un donjon — pas de report ni
    // d'usure des PV d'un étage à l'autre. Un étage se gagne ou se perd « à froid ».
    const ally: CombatantInput = { ...hero, startHp: maxHp };
    const base = towerEnemy(floor);
    // Palier d'arc (New Game+) : PV/ATK scalés (DEF inchangée). Arc 1 = neutre.
    const scaled = scaleEnemyStatsForArc({ hp: base.hp, atk: base.atk }, arc);
    const enemy: CombatantInput = { ...base, hp: scaled.hp, atk: scaled.atk };

    combatSeed = (Math.imul(combatSeed, 1664525) + 1013904223) >>> 0;
    const combat = resolveCombat({ allies: [ally], enemies: [enemy], seed: combatSeed });

    fightResults.push({
      floor,
      kind,
      enemyName: enemy.name,
      hpBefore: [{ id: hero.id, hp: maxHp, maxHp }],
      combat,
    });

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
