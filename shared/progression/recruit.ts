/**
 * Taverne (au Village) : chaque jour, un choix de 8 recrues est proposé,
 * renouvelé à minuit. Chaque recrue a des BONUS DE NAISSANCE individuels par
 * stat (−20 % à +35 % de la base de classe) → bons et mauvais héros. Le joueur
 * en choisit et gère son effectif (max 5, renvoi possible). Grade S/A/B/C/D
 * dérivé de la qualité du roll. Pur et partagé front + Edge Function.
 */
import { createRng, type Rng } from '../combat/prng.ts';

/** Effectif maximum d'un joueur. */
export const MAX_ROSTER = 5;

/** Nombre de recrues proposées chaque jour. */
export const TAVERN_SIZE = 8;

/** Fourchette du roll de naissance, en fraction de la stat de base de classe. */
export const ROLL_MIN = -0.2;
export const ROLL_MAX = 0.35;

/** Coût du prochain recrutement (l'effectif de départ est de 3 héros). */
export function recruitCost(rosterSize: number): number {
  return 250 * Math.pow(2, Math.max(0, rosterSize - 3));
}

export type ClassBase = {
  id: string;
  base_hp: number;
  base_atk: number;
  base_def: number;
  base_speed: number;
};

export type RecruitBonuses = {
  bonus_hp: number;
  bonus_atk: number;
  bonus_def: number;
  bonus_speed: number;
};

const FIRST_NAMES = [
  'Kael',
  'Mira',
  'Torvin',
  'Lysa',
  'Baldric',
  'Nyra',
  'Doran',
  'Elowen',
  'Garrick',
  'Sylvie',
  'Rurik',
  'Anya',
  'Fenris',
  'Isolde',
  'Corvin',
  'Maëlle',
  'Ozric',
  'Thalia',
  'Brennan',
  'Vesper',
  'Aldous',
  'Katria',
  'Merrick',
  'Séraphine',
  'Hadrien',
  'Wren',
  'Lothaire',
  'Imara',
  'Cassian',
  'Odile',
];

export function rollRecruitName(rng: Rng): string {
  return FIRST_NAMES[rng.int(0, FIRST_NAMES.length - 1)]!;
}

/** Bonus de qualité maximum (décale la fourchette de roll vers le haut). */
export const RECRUIT_QUALITY_MAX = 0.22;

/**
 * Bonus de qualité des recrues selon la PROGRESSION (zones terminées = boss
 * battus). Plus le joueur avance, plus la fourchette de naissance se décale vers
 * le haut → meilleurs héros plus probables (à l'image des matériaux de zone qui
 * améliorent la qualité des objets forgés). +2,5 % par zone, plafonné.
 */
export function recruitQualityBonus(zonesCompleted: number): number {
  return Math.min(RECRUIT_QUALITY_MAX, Math.max(0, zonesCompleted) * 0.025);
}

/**
 * Roll de naissance : chaque stat tire une fraction dans [ROLL_MIN, ROLL_MAX],
 * décalée vers le haut de `qualityBonus` (progression).
 */
export function rollRecruitBonuses(base: ClassBase, rng: Rng, qualityBonus = 0): RecruitBonuses {
  const roll = (stat: number): number => {
    const f = ROLL_MIN + qualityBonus + rng.next() * (ROLL_MAX - ROLL_MIN);
    return Math.round(stat * f);
  };
  return {
    bonus_hp: roll(base.base_hp),
    bonus_atk: roll(base.base_atk),
    bonus_def: roll(base.base_def),
    bonus_speed: roll(base.base_speed),
  };
}

export type Grade = 'S' | 'A' | 'B' | 'C' | 'D';

export const GRADE_META: Record<Grade, { label: string; color: string }> = {
  S: { label: 'S', color: '#e8b64a' },
  A: { label: 'A', color: '#a78bfa' },
  B: { label: 'B', color: '#60a5fa' },
  C: { label: 'C', color: '#9ca3af' },
  D: { label: 'D', color: '#f87171' },
};

/**
 * Seuils de grade sur le score de qualité `q` (moyenne des 4 rolls normalisés,
 * ≈ moyenne de 4 uniformes). Calibrés pour viser une distribution volontairement
 * sélective : ~60 % D, 30 % C, 8 % B, 1,8 % A, 0,2 % S. Un bon héros doit être rare.
 * (Validé par test Monte-Carlo dans recruit.test.ts.)
 */
export const GRADE_THRESHOLDS: Record<Exclude<Grade, 'D'>, number> = {
  S: 0.886,
  A: 0.794,
  B: 0.689,
  C: 0.538,
};

/**
 * Chances de grade d'une recrue AU ROLL DE BASE (sans bonus de qualité). Le bonus
 * de qualité (progression en zones) décale la fourchette vers le haut et améliore
 * ces chances. Affiché en taverne pour la transparence. Somme ≈ 100 %.
 */
export const GRADE_ODDS_BASE: Record<Grade, number> = {
  S: 0.2,
  A: 1.8,
  B: 8,
  C: 30,
  D: 60,
};

/**
 * Grade d'un héros : position moyenne de ses rolls dans la fourchette.
 * Un roll neutre (rolls à 0 → q = 0.5) sort désormais en D : l'excellence est rare.
 */
export function recruitGrade(bonuses: RecruitBonuses, base: ClassBase): Grade {
  const norm = (bonus: number, stat: number): number => {
    if (stat <= 0) return 0.5;
    const f = bonus / stat;
    return Math.max(0, Math.min(1, (f - ROLL_MIN) / (ROLL_MAX - ROLL_MIN)));
  };
  const q =
    (norm(bonuses.bonus_hp, base.base_hp) +
      norm(bonuses.bonus_atk, base.base_atk) +
      norm(bonuses.bonus_def, base.base_def) +
      norm(bonuses.bonus_speed, base.base_speed)) /
    4;
  if (q >= GRADE_THRESHOLDS.S) return 'S';
  if (q >= GRADE_THRESHOLDS.A) return 'A';
  if (q >= GRADE_THRESHOLDS.B) return 'B';
  if (q >= GRADE_THRESHOLDS.C) return 'C';
  return 'D';
}

/* --------------------------------------------------------- POOL QUOTIDIEN -- */

/** Hash déterministe (FNV-1a) → seed 32 bits stable pour (joueur, jour). */
export function hashSeed(...parts: Array<string | number>): number {
  let h = 2166136261 >>> 0;
  const str = parts.join('|');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export type Candidate = {
  slot: number;
  class_id: string;
  name: string;
  bonuses: RecruitBonuses;
};

/**
 * ONBOARDING (repli sans info de classes) : force ARCHER puis SOIGNEUR sur les
 * deux premiers slots tant que l'effectif < 3.
 */
export const ONBOARDING_TAVERN_CLASSES: Record<number, string> = { 0: 'archer', 1: 'soigneur' };

/**
 * Classes imposées par slot dans la Taverne.
 *
 * GARANTIE « une de chaque classe » : tant que le joueur ne possède pas au moins
 * un héros de CHAQUE classe du jeu (`ownedClassIds` ⊉ `allClassIds`), la Taverne
 * réserve ses premiers slots à TOUTES les classes (mapping STABLE slot→classe,
 * trié et indépendant de ce qui a déjà été recruté, pour ne jamais décaler les
 * slots déjà réclamés). Une fois une classe de chaque possédée → pool normal.
 *
 * Repli : si les listes de classes ne sont pas fournies, on retombe sur l'ancien
 * onboarding (archer + soigneur, effectif < 3).
 */
export function forcedTavernClasses(
  rosterSize: number,
  ownedClassIds?: readonly string[],
  allClassIds?: readonly string[],
): Record<number, string> {
  if (allClassIds && allClassIds.length > 0 && ownedClassIds) {
    const owned = new Set(ownedClassIds);
    if (allClassIds.every((id) => owned.has(id))) return {};
    const forced: Record<number, string> = {};
    [...allClassIds].sort().forEach((id, i) => {
      if (i < TAVERN_SIZE) forced[i] = id;
    });
    return forced;
  }
  return rosterSize < 3 ? ONBOARDING_TAVERN_CLASSES : {};
}

/**
 * Génère le pool quotidien de recrues (déterministe pour une seed donnée).
 * `forced` impose la classe de certains slots (onboarding) ; les stats/nom restent
 * tirés — la même seed + le même `forced` donnent donc toujours le même pool.
 */
export function rollTavernPool(
  seed: number,
  classes: ClassBase[],
  forced: Record<number, string> = {},
  qualityBonus = 0,
): Candidate[] {
  const byId = new Map(classes.map((c) => [c.id, c]));
  const out: Candidate[] = [];
  for (let i = 0; i < TAVERN_SIZE; i++) {
    const rng = createRng((seed + (i + 1) * 0x9e3779b9) >>> 0);
    // On consomme toujours le tirage de classe (déterminisme), puis on impose si besoin.
    const picked = classes[rng.int(0, classes.length - 1)]!;
    const cls = byId.get(forced[i] ?? '') ?? picked;
    out.push({
      slot: i,
      class_id: cls.id,
      name: rollRecruitName(rng),
      bonuses: rollRecruitBonuses(cls, rng, qualityBonus),
    });
  }
  return out;
}
