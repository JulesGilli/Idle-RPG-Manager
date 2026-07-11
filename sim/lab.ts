/**
 * LABORATOIRE : isole chaque classe x spe (branche) sur 4 axes mesurables, via
 * des mannequins de test. Gear IDENTIQUE pour toutes les spes (zone 10, calibre,
 * niv 30) → seule la spe change, donc les chiffres sont comparables entre eux.
 *
 *  - DPS mono   : degats/round infliges a UN mannequin tres resistant.
 *  - DPS AOE    : degats/round total infliges a 5 mannequins.
 *  - Tankiness  : rounds survecus face a un trio d'attaquants standard.
 *  - HPS (soin) : soin/round rendu a 4 allies blesses.
 *
 * Tout passe par le VRAI moteur (resolveCombat) : procs, crits, cooldowns,
 * DoT, barrieres, thorns... sont pris en compte tels quels.
 */
import { resolveCombat } from '../shared/combat/resolveCombat.ts';
import type { CombatantInput } from '../shared/combat/types.ts';
import { GEAR_PROFILES, type ClassId } from './config.ts';
import { buildHero } from './hero.ts';
import { BRANCH_BUILDS, type BranchBuild } from './builds.ts';
import type { GameData } from './loadData.ts';

const ON = GEAR_PROFILES.find((p) => p.id === 'on')!;
const REF_ZONE = 10; // gear de reference endgame
const REF_LEVEL = 30; // niveau max

// Parametres des bancs (tunables).
const DPS_ROUNDS = 40; // assez long pour capter plusieurs cycles de cooldown
const DPS_BAG_HP = 5_000_000; // mannequin quasi increvable
const AOE_TARGETS = 5;
const TANK_ROUNDS = 60;
const TANK_ATTACKERS = 3;
const TANK_ATTACKER_ATK = 320; // calibre pour tuer un squishy en qq rounds, un tank en ~30-50
const HPS_ROUNDS = 40;
const HPS_ALLIES = 4;

function bag(id: string): CombatantInput {
  return { id, name: 'Mannequin', role: 'enemy', hp: DPS_BAG_HP, atk: 0, def: 0, speed: 1 };
}
function attacker(id: string): CombatantInput {
  return { id, name: 'Sparring', role: 'enemy', hp: 1_000_000, atk: TANK_ATTACKER_ATK, def: 0, speed: 20 };
}
function woundedAlly(id: string): CombatantInput {
  return { id, name: 'Blesse', role: 'dps', hp: 100_000, startHp: 20_000, atk: 0, def: 0, speed: 5 };
}

/** Somme des degats infliges par `heroId` a des cibles NON-alliees. */
function damageDealt(events: ReturnType<typeof resolveCombat>['events'], heroId: string, allyIds: Set<string>): number {
  let dmg = 0;
  for (const ev of events) {
    if (ev.type !== 'attack') continue;
    const src = ev.sourceId ?? ev.actorId;
    if (src !== heroId) continue;
    if (allyIds.has(ev.targetId)) continue;
    dmg += ev.damage;
  }
  return dmg;
}

/** DPS (mono si targets=1, AOE si >1) : degats/round sur des mannequins increvables. */
function benchDps(hero: CombatantInput, targets: number): number {
  const bags = Array.from({ length: targets }, (_, i) => bag(`bag${i}`));
  const combat = resolveCombat({ allies: [hero], enemies: bags, seed: 1234, maxRounds: DPS_ROUNDS });
  const dmg = damageDealt(combat.events, hero.id, new Set([hero.id]));
  return dmg / DPS_ROUNDS;
}

/** Tankiness : rounds survecus face a TANK_ATTACKERS attaquants standard. */
function benchTank(hero: CombatantInput): number {
  const atkers = Array.from({ length: TANK_ATTACKERS }, (_, i) => attacker(`atk${i}`));
  const combat = resolveCombat({ allies: [hero], enemies: atkers, seed: 4321, maxRounds: TANK_ROUNDS });
  const death = combat.events.find((e) => e.type === 'death' && (e as { combatantId?: string }).combatantId === hero.id);
  return death ? (death as { round: number }).round : TANK_ROUNDS;
}

/** HPS : soin/round rendu par le heros a 4 allies blesses (attaquant faible pour entretenir les blessures). */
function benchHps(hero: CombatantInput): number {
  const allies = [hero, ...Array.from({ length: HPS_ALLIES }, (_, i) => woundedAlly(`ally${i}`))];
  const foe: CombatantInput = { id: 'poke', name: 'Harceleur', role: 'enemy', hp: 1_000_000, atk: 400, def: 0, speed: 8 };
  const combat = resolveCombat({ allies, enemies: [foe], seed: 777, maxRounds: HPS_ROUNDS });
  let healed = 0;
  for (const ev of combat.events) {
    if (ev.type === 'heal' && ev.actorId === hero.id) healed += ev.amount;
  }
  return healed / HPS_ROUNDS;
}

export type SpecStats = {
  buildId: string;
  classId: ClassId;
  branch: string;
  role: BranchBuild['role'];
  stDps: number;
  aoeDps: number;
  tankRounds: number;
  hps: number;
};

function heroForBuild(data: GameData, b: BranchBuild): CombatantInput {
  const cls = data.heroClasses[b.classId]!;
  return buildHero(cls, b.classId, REF_ZONE, ON, {
    level: REF_LEVEL,
    learned: b.learned,
    loadout: { activeId: b.activeId, ultimateId: b.ultimateId },
  });
}

/** Matrice complete : chaque branche-spe mesuree sur les 4 axes. */
export function runSpecMatrix(data: GameData): SpecStats[] {
  return BRANCH_BUILDS.map((b) => {
    const hero = heroForBuild(data, b);
    return {
      buildId: b.id,
      classId: b.classId,
      branch: b.branch,
      role: b.role,
      stDps: benchDps(hero, 1),
      aoeDps: benchDps(hero, AOE_TARGETS),
      tankRounds: benchTank(hero),
      hps: benchHps(hero),
    };
  });
}

/**
 * Cas special demande : le SOIGNEUR offensif (set Ame Offerte, heal_convert) —
 * mesure son DPS mono quand ses soins sont convertis en degats. Compare a la
 * spe Lumiere sans set. Montre l'interet d'un build heal->degats (rework healer).
 */
export function runOffensiveHealer(data: GameData): { label: string; stDps: number; hps: number; tankRounds: number }[] {
  const cls = data.heroClasses['soigneur']!;
  const lum = BRANCH_BUILDS.find((b) => b.id === 'soigneur:Lumiere')!;

  // Soigneur Lumiere sans set.
  const plain = buildHero(cls, 'soigneur', REF_ZONE, ON, {
    level: REF_LEVEL,
    learned: lum.learned,
    loadout: { activeId: lum.activeId, ultimateId: lum.ultimateId },
  });
  // Soigneur Lumiere + set Ame Offerte 2 pieces (heal_convert 0.5).
  const offensive = buildHero(cls, 'soigneur', REF_ZONE, ON, {
    level: REF_LEVEL,
    learned: lum.learned,
    loadout: { activeId: lum.activeId, ultimateId: lum.ultimateId },
    setIds: ['ame_offerte', 'ame_offerte'],
  });

  return [
    { label: 'Soigneur (Lumiere, sans set)', stDps: benchDps(plain, 1), hps: benchHps(plain), tankRounds: benchTank(plain) },
    { label: 'Soigneur (Lumiere + Ame Offerte)', stDps: benchDps(offensive, 1), hps: benchHps(offensive), tankRounds: benchTank(offensive) },
  ];
}
