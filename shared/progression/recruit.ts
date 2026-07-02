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

/** Roll de naissance : chaque stat tire une fraction dans [ROLL_MIN, ROLL_MAX]. */
export function rollRecruitBonuses(base: ClassBase, rng: Rng): RecruitBonuses {
  const roll = (stat: number): number => {
    const f = ROLL_MIN + rng.next() * (ROLL_MAX - ROLL_MIN);
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

/** Génère le pool quotidien de recrues (déterministe pour une seed donnée). */
export function rollTavernPool(seed: number, classes: ClassBase[]): Candidate[] {
  const out: Candidate[] = [];
  for (let i = 0; i < TAVERN_SIZE; i++) {
    const rng = createRng((seed + (i + 1) * 0x9e3779b9) >>> 0);
    const cls = classes[rng.int(0, classes.length - 1)]!;
    out.push({
      slot: i,
      class_id: cls.id,
      name: rollRecruitName(rng),
      bonuses: rollRecruitBonuses(cls, rng),
    });
  }
  return out;
}
