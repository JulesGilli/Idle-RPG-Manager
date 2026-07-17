/**
 * Boss de la semaine — helpers PURS (partagés front + Edge Function).
 *
 * Concept : en semaine (lun→ven, cf. `events.ts` worldBossActive), un boss
 * COMMUNAUTAIRE et IMMORTEL. Chaque joueur le frappe UNE FOIS PAR JOUR (vrai combat
 * serveur). Les dégâts de tous s'additionnent (`total_damage`) : à chaque PALIER de
 * dégâts collectifs franchi, une récompense se débloque POUR TOUS les contributeurs.
 * En fin de semaine (bascule de `weekKey`), le CLASSEMENT individuel (somme des
 * dégâts) distribue de petites récompenses + un TITRE éphémère (+5 % ATK au 1er).
 *
 * Comme `events.ts`/`release.ts` : côté Deno on passe `Date.now()` = HORLOGE
 * SERVEUR ; le combat est résolu serveur → impossible de tricher.
 */
import type { CombatantInput } from '../combat/types.ts';

/* ------------------------------------------------------------------ calendrier -- */

/** Composantes civiles (Europe/Paris) d'un instant : année/mois/jour numériques. */
export function parisCivilDate(nowMs: number): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(nowMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  return { y: get('year'), m: get('month'), d: get('day') };
}

/** Clé de JOUR (Paris), `YYYY-MM-DD` — sert à l'unicité « 1 frappe / jour / joueur ». */
export function parisDayKey(nowMs: number): string {
  const { y, m, d } = parisCivilDate(nowMs);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Clé de SEMAINE ISO (Paris), `YYYY-Www` (ex. `2026-W29`). La bascule de cette clé
 * déclenche la finalisation de l'event et la création du suivant. Semaine ISO =
 * lundi→dimanche, numérotée sur le jeudi (norme ISO-8601).
 */
export function isoWeekKey(nowMs: number): string {
  const { y, m, d } = parisCivilDate(nowMs);
  // Date UTC "civile" (minuit) : on ne veut QUE la date, pas l'heure.
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (date.getUTCDay() + 6) % 7; // lundi=0 … dimanche=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // jeudi de la semaine courante
  const isoYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/**
 * Fin APPROXIMATIVE de la semaine (pour l'AFFICHAGE d'un compte à rebours) : le
 * prochain lundi 00:00 Paris, exprimé en UTC. La logique de bascule, elle, se fonde
 * sur `isoWeekKey` (robuste au DST), pas sur ce timestamp.
 */
export function weekEndsAt(nowMs: number): string {
  const { y, m, d } = parisCivilDate(nowMs);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (date.getUTCDay() + 6) % 7; // lundi=0 … dimanche=6
  date.setUTCDate(date.getUTCDate() + (7 - dayNum)); // lundi suivant, minuit "civil"
  // Paris ≈ UTC+1/+2 → recule d'~1 h pour approcher minuit local ; l'affichage tolère.
  date.setUTCHours(date.getUTCHours() - 2);
  return date.toISOString();
}

/* ------------------------------------------------------------------------ boss -- */

/** Noms de boss en rotation hebdo (déterministe : indexé par la semaine ISO). */
const BOSS_NAMES = [
  'Léviathan des Abysses',
  'Colosse de Cendres',
  'Tyran Cornu',
  'Golem Primordial',
  'Hydre Éternelle',
  'Dévoreur de Mondes',
];

/** Numéro de semaine extrait d'une clé `YYYY-Www` (pour la rotation déterministe). */
function weekNumber(weekKey: string): number {
  const n = Number(weekKey.split('-W')[1] ?? '1');
  return Number.isFinite(n) ? n : 1;
}

/** Nom du boss de la semaine (déterministe à partir de la clé de semaine). */
export function worldBossName(weekKey: string): string {
  return BOSS_NAMES[weekNumber(weekKey) % BOSS_NAMES.length] ?? BOSS_NAMES[0]!;
}

/** PV énormes du « sac de frappe » : le combat ne le TUE jamais (boss immortel). */
const WB_FIGHT_HP = 1_000_000_000;
/** ATK de départ + rampe (comme l'arc) : le boss devient létal, la contribution suit
 *  la DURABILITÉ réelle de l'escouade. Monte un peu chaque semaine (fraîcheur). */
const WB_FIGHT_ATK_BASE = 120;
const WB_FIGHT_ATK_RAMP = 0.05;
const WB_FIGHT_DEF_BASE = 100;

/**
 * Le boss tel qu'affronté à CHAQUE frappe : sac de frappe à PV énormes, insensible
 * au stun, qui s'enrage (+5 %/tour). La CONTRIBUTION du joueur = dégâts infligés =
 * `maxHp effectif − PV restants` du boss en fin de combat. DEF/ATK montent légèrement
 * avec le numéro de semaine pour renouveler la difficulté.
 */
export function worldBossFightCombatant(weekKey: string): CombatantInput {
  const wk = weekNumber(weekKey);
  const atk = Math.round(WB_FIGHT_ATK_BASE * (1 + 0.03 * wk));
  const def = Math.round(WB_FIGHT_DEF_BASE * (1 + 0.02 * wk));
  return {
    id: 'world-boss',
    name: worldBossName(weekKey),
    role: 'enemy',
    hp: WB_FIGHT_HP,
    atk,
    def,
    speed: 8,
    abilities: [
      { kind: 'immune', chance: 1, statuses: ['stun'] },
      { kind: 'atk_ramp', perTurn: WB_FIGHT_ATK_RAMP },
    ],
  };
}

/* --------------------------------------------------------------- paliers/titre -- */

/** Un palier de dégâts collectifs : seuil franchi → récompense pour tous les contributeurs. */
export type WorldBossTier = { idx: number; threshold: number; reward: { gold?: number } };

/**
 * Paliers par DÉFAUT (seed de `world_boss_tier_defs`, éditable ensuite via le Table
 * Editor). Seuils de dégâts CUMULÉS croissants → récompense d'or commune.
 */
export const DEFAULT_WORLD_BOSS_TIERS: WorldBossTier[] = [
  { idx: 1, threshold: 5_000_000, reward: { gold: 5_000 } },
  { idx: 2, threshold: 20_000_000, reward: { gold: 15_000 } },
  { idx: 3, threshold: 50_000_000, reward: { gold: 40_000 } },
  { idx: 4, threshold: 150_000_000, reward: { gold: 100_000 } },
  { idx: 5, threshold: 400_000_000, reward: { gold: 250_000 } },
];

/** Nombre de paliers franchis par un total de dégâts donné. */
export function tiersUnlocked(totalDamage: number, tiers: WorldBossTier[]): number {
  return tiers.filter((t) => totalDamage >= t.threshold).length;
}

/** Titre éphémère du 1er du classement : +5 % ATK tant qu'il est équipé et non expiré. */
export const WORLD_BOSS_TITLE = 'Fléau de la Semaine';
export const WORLD_BOSS_TITLE_ATK_MULT = 1.05;

/**
 * Récompense de CLASSEMENT (fin de semaine) selon le rang (1-indexé). Le 1er reçoit
 * en plus le titre `WORLD_BOSS_TITLE`. Or décroissant sur le top 3.
 */
export function rankReward(rank: number): { gold: number; title: boolean } {
  if (rank === 1) return { gold: 100_000, title: true };
  if (rank === 2) return { gold: 50_000, title: false };
  if (rank === 3) return { gold: 25_000, title: false };
  if (rank <= 10) return { gold: 10_000, title: false };
  return { gold: 0, title: false };
}
