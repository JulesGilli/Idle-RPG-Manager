/**
 * Banc de test — CHAMPS DE BATAILLE (Arc 2, batailles rangées 10v10).
 *
 * Particularité : c'est la seule activité où l'escouade monte à 10 héros, et la
 * seule qui se joue en ARC 2. On y rejoue le vrai moteur contre la vraie armée
 * (`battlefieldArmy`), donc le rapport reflète exactement la prod.
 *
 * ⚠️ Les SETS font une part énorme de la puissance réelle (effets 2 et 4 pièces
 * en plus des stats). Une escouade sans set n'est PAS un étalon représentatif :
 * elle sous-estime massivement le joueur et pousse à sur-durcir le contenu.
 * D'où les profils ci-dessous, du plancher au plafond.
 *
 * Il n'existe encore AUCUN set d'arc 2 : un joueur d'arc 2 forge donc les sets
 * d'ARC 1, qui reçoivent quand même `tierGearMult(2)` (×14) au craft — ils sont
 * à pleine échelle, effets compris. C'est l'étalon `set` ci-dessous.
 */
import type { CombatantInput } from '../shared/combat/types.ts';
import { resolveCombat } from '../shared/combat/resolveCombat.ts';
import { BATTLEFIELDS, battlefieldArmy, BATTLEFIELD_MAX_TEAM } from '../shared/progression/battlefield.ts';
import { tierGearMult } from '../shared/progression/arc.ts';
import { effectiveBonus } from '../shared/progression/forge.ts';
import { buildHero, gearBonuses } from './hero.ts';
import { campaignBuild, setBuild } from './builds.ts';
import { GEAR_PROFILES, SEEDS_PER_SCENARIO, BASE_SEED, type ClassId } from './config.ts';
import type { GameData } from './loadData.ts';

/** L'arc où se jouent les batailles (les stats d'équipement y sont ×14). */
const ARC = 2;
/** Niveau maximum du jeu — un joueur d'arc 2 y est forcément. */
const LEVEL = 30;
/** Zone de référence pour le matériau d'équipement : la dernière de l'arc 1. */
const ZONE = 10;

/**
 * Compo de 10 = la compo de 5 doublée. Ordre significatif : les 6 premiers
 * servent aussi de test « petit vivier ».
 */
const SQUAD10: ClassId[] = [
  'paladin', 'guerrier', 'soigneur', 'archer', 'mage',
  'paladin', 'guerrier', 'soigneur', 'archer', 'mage',
];

/** Étalons testés, du plancher au plafond réaliste. */
export type BattlefieldProfile = 'forge' | 'set' | 'set6' | 'arc2';

const PROFILE_LABEL: Record<BattlefieldProfile, string> = {
  forge: 'Forge ultime, skills, SANS set (plancher)',
  set: 'Set 4 pieces + skills (etalon reel)',
  set6: 'Set 4 pièces, 6 héros seulement (petit vivier)',
  arc2: 'ARC 2 RÉEL : forge ×16 + set 2 pièces d’arc 2',
};

/**
 * Set d'ARC 2 porté par chaque classe. Ce sont des 2-pièces (bijou + relique),
 * donc ils LAISSENT l'arme et l'armure à la forge — c'est toute l'architecture
 * d'arc 2, et ce que le profil `set` (4 pièces d'arc 1) ne modélise plus.
 */
const ARC2_SET_BY_CLASS: Record<ClassId, string> = {
  paladin: 'a2_physique',
  guerrier: 'a2_physique',
  archer: 'a2_volee', // multi-cibles : le set qui compte en 10v10
  mage: 'a2_magique',
  soigneur: 'a2_soin',
};

/** Construit l'escouade d'un profil donné, à l'échelle de l'arc 2. */
function squadFor(data: GameData, profile: BattlefieldProfile): CombatantInput[] {
  const tm = tierGearMult(ARC);
  const size = profile === 'set6' ? 6 : BATTLEFIELD_MAX_TEAM;
  return SQUAD10.slice(0, size).map((classId, i) => {
    const cls = data.heroClasses[classId]!;
    const b = campaignBuild(classId);

    if (profile === 'arc2') {
      // LE profil représentatif d'un joueur d'arc 2 : arme et armure forgées à
      // l'échelle de l'arc, plus un set 2 pièces d'arc 2 sur bijou + relique
      // (son bonus de stats ET son effet de combat). Les sets d'arc 1 n'étant
      // plus craftables, c'est lui qui doit piloter le calibrage.
      const g = gearBonuses(classId, ZONE, GEAR_PROFILES[2]!);
      const setId = ARC2_SET_BY_CLASS[classId];
      return buildHero(cls, classId, ZONE, GEAR_PROFILES[2]!, {
        level: LEVEL,
        learned: b.learned,
        loadout: { activeId: b.activeId, ultimateId: b.ultimateId },
        // 2 entrées du MÊME set → déclenche bonus 2 pièces + effet.
        setIds: [setId, setId],
        gearOverride: {
          atk: Math.round(g.atk * tm),
          def: Math.round(g.def * tm),
          hp: Math.round(g.hp * tm),
        },
        tag: String(i),
      });
    }

    if (profile === 'forge') {
      // Plancher : équipement de forge ultime, aucun set (donc aucun effet 2/4 pièces).
      const g = gearBonuses(classId, ZONE, GEAR_PROFILES[2]!);
      return buildHero(cls, classId, ZONE, GEAR_PROFILES[2]!, {
        level: LEVEL,
        learned: b.learned,
        loadout: { activeId: b.activeId, ultimateId: b.ultimateId },
        gearOverride: {
          atk: Math.round(g.atk * tm),
          def: Math.round(g.def * tm),
          hp: Math.round(g.hp * tm),
        },
        tag: String(i),
      });
    }

    // Étalon réel : 4 pièces du set de campagne, portées à l'échelle de l'arc.
    //
    // ⚠️ `setBuild` renvoie les stats BRUTES du craft : contrairement à
    // `gearBonuses`, il n'applique AUCUN niveau de renforcement. Sans la
    // correction ci-dessous, l'escouade « set » se bat avec des pièces +0 face à
    // une escouade forge +5 (≈ +50 % de stats) — et ressort paradoxalement plus
    // FAIBLE que l'étalon sans set, ce qui pousserait à sur-durcir le contenu.
    // Un joueur renforce évidemment ses pièces de set comme le reste.
    const sb = setBuild(classId, ZONE);
    const up = GEAR_PROFILES[2]!.upgradeLevel;
    return buildHero(cls, classId, ZONE, GEAR_PROFILES[2]!, {
      level: LEVEL,
      learned: b.learned,
      loadout: { activeId: b.activeId, ultimateId: b.ultimateId },
      setIds: sb.setIds,
      gearOverride: {
        atk: Math.round(effectiveBonus(sb.bonuses.atk, up) * tm),
        def: Math.round(effectiveBonus(sb.bonuses.def, up) * tm),
        hp: Math.round(effectiveBonus(sb.bonuses.hp, up) * tm),
      },
      tag: String(i),
    });
  });
}

export type BattlefieldCell = {
  idx: number;
  name: string;
  /** Taux de victoire sur `SEEDS_PER_SCENARIO` graines (0..100). */
  winPct: number;
  /** Manches moyennes (indice de longueur du combat). */
  rounds: number;
  /** PV restants moyens de l'escouade en cas de victoire (0..100). */
  hpLeftPct: number;
};

export type BattlefieldRun = {
  profile: BattlefieldProfile;
  label: string;
  teamSize: number;
  cells: BattlefieldCell[];
};

/** Rejoue chaque bataille sur N graines pour un profil donné. */
function runProfile(data: GameData, profile: BattlefieldProfile): BattlefieldRun {
  const allies = squadFor(data, profile);
  const cells = BATTLEFIELDS.map((def) => {
    let wins = 0;
    let rounds = 0;
    let hpLeft = 0;
    for (let s = 0; s < SEEDS_PER_SCENARIO; s++) {
      const r = resolveCombat({
        allies,
        enemies: battlefieldArmy(def, ARC),
        seed: BASE_SEED + s * 7,
      });
      rounds += r.rounds;
      if (r.result === 'win') {
        wins++;
        const alive = r.finalState.filter((f) => allies.some((a) => a.id === f.id));
        const cur = alive.reduce((s2, f) => s2 + Math.max(0, f.hp), 0);
        const max = allies.reduce((s2, a) => s2 + a.hp, 0);
        hpLeft += max > 0 ? (cur / max) * 100 : 0;
      }
    }
    return {
      idx: def.idx,
      name: def.name,
      winPct: Math.round((wins / SEEDS_PER_SCENARIO) * 100),
      rounds: Math.round(rounds / SEEDS_PER_SCENARIO),
      hpLeftPct: wins > 0 ? Math.round(hpLeft / wins) : 0,
    };
  });
  return { profile, label: PROFILE_LABEL[profile], teamSize: allies.length, cells };
}

/** Passe complète sur les champs de bataille (tous profils). */
export function runBattlefields(data: GameData): BattlefieldRun[] {
  return (['forge', 'set', 'set6', 'arc2'] as BattlefieldProfile[]).map((p) => runProfile(data, p));
}

/**
 * Verdict d'équilibrage. La cible : l'étalon RÉEL (avec set) doit acquérir les
 * paliers bas, se battre au milieu, et laisser le dernier palier CONTESTÉ —
 * ni mur (0 %) ni formalité (100 %), parce qu'il reste au joueur des leviers que
 * la sim n'a pas (runes, buff de guilde, objets divins, bénédictions).
 */
export function battlefieldVerdicts(runs: BattlefieldRun[]): string[] {
  const out: string[] = [];
  // Le juge est le profil ARC 2 REEL (forge + set 2 pieces d'arc 2). Les sets
  // d'arc 1 ne sont plus craftables en arc 2 : calibrer dessus mesurait une
  // escouade que personne ne peut aligner.
  const real = runs.find((r) => r.profile === 'arc2');
  if (!real) return out;
  const last = real.cells.at(-1);
  const first = real.cells[0];
  if (first && first.winPct < 90) {
    out.push(`B1 « ${first.name} » à ${first.winPct}% pour l'étalon set : la porte d'entrée est trop dure.`);
  }
  if (last && last.winPct === 0) {
    out.push(`B${last.idx} « ${last.name} » INVAINCU (0%) même avec set : contenu mort, adoucir.`);
  }
  if (last && last.winPct > 85) {
    out.push(`B${last.idx} « ${last.name} » à ${last.winPct}% : le sommet est une formalité, durcir.`);
  }
  // Une falaise = un palier qui passe de « acquis » à « impossible » d'un coup.
  for (let i = 1; i < real.cells.length; i++) {
    const prev = real.cells[i - 1]!;
    const cur = real.cells[i]!;
    if (prev.winPct >= 90 && cur.winPct <= 5) {
      out.push(`Falaise B${prev.idx}→B${cur.idx} : ${prev.winPct}% puis ${cur.winPct}%. Lisser la marche.`);
    }
  }
  return out;
}
