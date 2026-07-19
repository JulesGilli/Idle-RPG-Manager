/**
 * Taverne (au Village) : chaque jour, un choix de 8 recrues est proposé,
 * renouvelé à minuit. Chaque recrue a des BONUS DE NAISSANCE individuels par
 * stat (−20 % à +35 % de la base de classe) → bons et mauvais héros. Le joueur
 * en choisit et gère son effectif (max 5, renvoi possible). Grade S/A/B/C/D
 * dérivé de la qualité du roll. Pur et partagé front + Edge Function.
 */
import { createRng, type Rng } from '../combat/prng.ts';

/** Slots de perso de DÉPART (V2). Le cap grimpe de +1 par donjon terminé (1re fois). */
export const ROSTER_BASE = 5;

/**
 * Effectif maximum ABSOLU d'un joueur = `ROSTER_BASE` + un slot par donjon (8).
 * Les compositions de combat restent à 5 (MAX_TEAM) ; c'est le vivier total.
 *
 * Volontairement écrit en dur plutôt qu'importé de `dungeon.ts` : ce module est
 * embarqué par l'Edge Function `recruit`, et `dungeon.ts` tire tout le moteur de
 * combat avec lui. La cohérence avec `DUNGEON_COUNT` est vérifiée par un test
 * (`recruit.test.ts`) plutôt que par le graphe d'imports.
 */
export const MAX_ROSTER = 13;

/**
 * Effectif maximum COURANT : 5 de base + 1 slot par donjon distinct déjà terminé,
 * plafonné à MAX_ROSTER. (V2 — cf. docs/refonte-v2.md §6.)
 */
export function maxRosterFor(dungeonsCleared: number): number {
  return Math.min(MAX_ROSTER, ROSTER_BASE + Math.max(0, dungeonsCleared));
}

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

/**
 * Chances RÉELLES de chaque grade pour un `qualityBonus` donné (en %).
 * Le roll normalisé d'une stat vaut `min(1, U + c)` avec `U ~ Uniform(0,1)` et
 * `c = qualityBonus / (ROLL_MAX − ROLL_MIN)` : le bonus décale la fourchette
 * vers le haut. Le grade dépend de `q` = moyenne de 4 tels rolls (même modèle
 * que la calibration des seuils). Monte-Carlo déterministe → stable au rendu.
 * À `qualityBonus = 0`, retrouve {@link GRADE_ODDS_BASE} à ~0,1 % près.
 */
export function recruitGradeOdds(qualityBonus = 0, samples = 200_000): Record<Grade, number> {
  const c = Math.max(0, qualityBonus) / (ROLL_MAX - ROLL_MIN);
  const counts: Record<Grade, number> = { S: 0, A: 0, B: 0, C: 0, D: 0 };
  const rng = createRng(0x9e3779b9);
  for (let i = 0; i < samples; i++) {
    let sum = 0;
    for (let k = 0; k < 4; k++) sum += Math.min(1, rng.next() + c);
    const q = sum / 4;
    const g: Grade =
      q >= GRADE_THRESHOLDS.S ? 'S'
      : q >= GRADE_THRESHOLDS.A ? 'A'
      : q >= GRADE_THRESHOLDS.B ? 'B'
      : q >= GRADE_THRESHOLDS.C ? 'C'
      : 'D';
    counts[g]++;
  }
  return {
    S: (100 * counts.S) / samples,
    A: (100 * counts.A) / samples,
    B: (100 * counts.B) / samples,
    C: (100 * counts.C) / samples,
    D: (100 * counts.D) / samples,
  };
}

/* --------------------------------------------------------- POOL QUOTIDIEN -- */

/** Heure (Paris) à laquelle la taverne renouvelle ses recrues. */
export const TAVERN_RESET_HOUR = 22;

/** Date + heure CIVILES à Paris pour un instant donné. */
function parisCivil(nowMs: number): { y: number; m: number; d: number; h: number; min: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(nowMs));
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value ?? '0');
  // `hour: '2-digit'` en hour12:false peut rendre « 24 » à minuit selon le moteur.
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour') % 24, min: get('minute') };
}

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * Clé de PÉRIODE de la taverne. Une période court de 22 h à 22 h (Paris) et porte
 * la date de son DÉBUT : avant 22 h, on appartient encore à la période de la veille.
 *
 * C'est cette clé — et elle seule — qui décide du renouvellement : le pool est
 * dérivé de `hashSeed(joueur, clé, …)`, rien n'est stocké. Robuste au changement
 * d'heure, contrairement à un calcul par décalage horaire.
 */
export function tavernDayKey(nowMs: number): string {
  const { y, m, d, h } = parisCivil(nowMs);
  const start = new Date(Date.UTC(y, m - 1, d));
  if (h < TAVERN_RESET_HOUR) start.setUTCDate(start.getUTCDate() - 1);
  return `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}-${pad(start.getUTCDate())}`;
}

/**
 * Prochain renouvellement, en ISO — pour l'AFFICHAGE d'un compte à rebours
 * uniquement. La bascule réelle s'appuie sur `tavernDayKey`, pas sur cet instant.
 * Le décalage Paris↔UTC est mesuré au moment présent (gère CET comme CEST).
 */
export function tavernResetsAt(nowMs: number): string {
  const { y, m, d, h, min } = parisCivil(nowMs);
  // Décalage courant Paris↔UTC, déduit de l'écart entre l'heure civile et l'instant.
  const offsetMs = Date.UTC(y, m - 1, d, h, min) - Math.floor(nowMs / 60_000) * 60_000;
  const next = new Date(Date.UTC(y, m - 1, d, TAVERN_RESET_HOUR));
  if (h >= TAVERN_RESET_HOUR) next.setUTCDate(next.getUTCDate() + 1);
  return new Date(next.getTime() - offsetMs).toISOString();
}

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
  // On trie par id : le pool doit être déterministe pour une seed donnée, quel que
  // soit l'ordre dans lequel la source (DB sans ORDER BY) nous fournit les classes.
  // Sans ça, les slots non forcés se re-tiraient à chaque refetch (après un
  // recrutement), et l'action recruit pouvait diverger de l'affichage.
  const ordered = [...classes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const out: Candidate[] = [];
  for (let i = 0; i < TAVERN_SIZE; i++) {
    const rng = createRng((seed + (i + 1) * 0x9e3779b9) >>> 0);
    // On consomme toujours le tirage de classe (déterminisme), puis on impose si besoin.
    const picked = ordered[rng.int(0, ordered.length - 1)]!;
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
