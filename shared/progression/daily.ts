/**
 * Récompense journalière (connexion quotidienne).
 *
 * Cycle de 10 jours en blocs par zone : matériaux → gemme → 3 reliques ultimes,
 * de la zone 1 (J1-3) à la zone 3 (J7-9), puis le jour 10 offre un SET COMPLET
 * ultime aléatoire de zone 3. Les reliques et le set sont forgés côté serveur en
 * rareté ultime (offerts, sans coût). Gemmes = simples ressources.
 * Après le jour 10, le cycle repart au jour 1. Rater un jour (écart > 1 jour civil)
 * remet la série à zéro (jour 1). Une seule réclamation par jour (date Europe/Paris,
 * calculée côté serveur — anti-triche).
 *
 * Pur & testable : la logique de date prend des chaînes 'YYYY-MM-DD'.
 */

export const DAILY_CYCLE = 10;

/**
 * Une case du calendrier. `materials` = ressources créditées (matériaux de zone
 * ET gemmes, qui sont de simples ressources). `relics`/`set` = objets forgés en
 * ultime, offerts (le `materialId` est le composant de zone qui fixe la puissance).
 */
export type DailyReward = {
  /** Jour dans le cycle, 1..10. */
  day: number;
  /** Ressources accordées (clés de player_resources : matériaux ou gemmes). */
  materials: { key: string; qty: number }[];
  /** Reliques offertes : 1 par type (RELIC_BASES), en ultime, forgées avec ce composant de zone. */
  relics?: { materialId: string };
  /** Set complet offert : toutes les pièces d'un set ALÉATOIRE, en ultime, avec ce composant de zone. */
  set?: { materialId: string };
};

const R = (key: string, qty: number) => ({ key, qty });

// Composant de zone (id de thème forge) par zone, pour les reliques/set offerts.
const Z1 = 'chene'; // zone 1
const Z2 = 'givre'; // zone 2
const Z3 = 'sables'; // zone 3

/** Table des récompenses, index 0 = jour 1 … index 9 = jour 10. */
export const DAILY_REWARDS: DailyReward[] = [
  { day: 1, materials: [R('ecorce', 20)] }, // matériaux zone 1
  { day: 2, materials: [R('gemme_seve', 1)] }, // gemme zone 1
  { day: 3, materials: [], relics: { materialId: Z1 } }, // 3 reliques ultimes zone 1
  { day: 4, materials: [R('cristal', 20)] }, // matériaux zone 2
  { day: 5, materials: [R('gemme_glace', 1)] }, // gemme zone 2
  { day: 6, materials: [], relics: { materialId: Z2 } }, // 3 reliques ultimes zone 2
  { day: 7, materials: [R('sable_noir', 20)] }, // matériaux zone 3
  { day: 8, materials: [R('gemme_solaire', 1)] }, // gemme zone 3
  { day: 9, materials: [], relics: { materialId: Z3 } }, // 3 reliques ultimes zone 3
  { day: 10, materials: [], set: { materialId: Z3 } }, // set complet ultime aléatoire zone 3
];

/** Récompense d'un jour (1..10). */
export function rewardForDay(day: number): DailyReward {
  return DAILY_REWARDS[Math.min(DAILY_CYCLE, Math.max(1, day)) - 1]!;
}

/** État persistant (table daily_claims). */
export type DailyClaimState = {
  /** Dernière date réclamée 'YYYY-MM-DD' (null = jamais). */
  lastClaimDate: string | null;
  /** Dernier jour réclamé dans le cycle (0 = jamais, sinon 1..10). */
  dayIndex: number;
};

/** Nombre de jours civils entre deux dates 'YYYY-MM-DD' (b - a). */
export function daysBetween(a: string, b: string): number {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  return Math.round((db - da) / 86_400_000);
}

/** Jour du cycle (1..10) qui serait réclamé MAINTENANT, selon l'état et la date du jour. */
export function nextClaimDay(state: DailyClaimState, today: string): number {
  if (!state.lastClaimDate || state.dayIndex <= 0) return 1;
  const gap = daysBetween(state.lastClaimDate, today);
  if (gap !== 1) return 1; // jour manqué (ou même jour, géré ailleurs) → série remise à 1
  if (state.dayIndex >= DAILY_CYCLE) return 1; // cycle bouclé → on repart
  return state.dayIndex + 1;
}

export type DailyStatus = {
  canClaim: boolean;
  alreadyClaimedToday: boolean;
  /** Le jour (1..10) réclamable maintenant (ou déjà réclamé aujourd'hui). */
  day: number;
};

/** Peut-on réclamer aujourd'hui ? Et quel jour du cycle ? */
export function dailyStatus(state: DailyClaimState, today: string): DailyStatus {
  if (state.lastClaimDate === today) {
    return { canClaim: false, alreadyClaimedToday: true, day: state.dayIndex };
  }
  return { canClaim: true, alreadyClaimedToday: false, day: nextClaimDay(state, today) };
}
