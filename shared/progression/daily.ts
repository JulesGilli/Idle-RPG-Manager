/**
 * Récompense journalière (connexion quotidienne).
 *
 * Cycle de 10 jours : chaque jour donne des MATÉRIAUX (jamais d'or) ; le jour 10
 * offre en plus un objet ULTIME de zone 10 (forgé en rareté ultime côté serveur).
 * Après le jour 10, le cycle repart au jour 1. Rater un jour (écart > 1 jour civil)
 * remet la série à zéro (jour 1). Une seule réclamation par jour (date Europe/Paris,
 * calculée côté serveur — anti-triche).
 *
 * Pur & testable : la logique de date prend des chaînes 'YYYY-MM-DD'.
 */

export const DAILY_CYCLE = 10;

/** Une case du calendrier : matériaux + éventuel objet de zone 10 (jour 10). */
export type DailyReward = {
  /** Jour dans le cycle, 1..10. */
  day: number;
  /** Matériaux accordés (clés de player_resources). */
  materials: { key: string; qty: number }[];
  /** true = accorde aussi un objet ultime de zone 10 (jour 10). */
  item?: boolean;
};

const R = (key: string, qty: number) => ({ key, qty });

/** Table des récompenses, index 0 = jour 1 … index 9 = jour 10. */
export const DAILY_REWARDS: DailyReward[] = [
  { day: 1, materials: [R('ecorce', 25)] },
  { day: 2, materials: [R('cristal', 25)] },
  { day: 3, materials: [R('sable_noir', 30), R('coeur_sylve', 1)] },
  { day: 4, materials: [R('spore', 30)] },
  { day: 5, materials: [R('obsidienne', 35), R('givre_pur', 2)] },
  { day: 6, materials: [R('rune', 35), R('ossement', 12)] },
  { day: 7, materials: [R('nacre_noire', 40), R('fragment_relique', 6)] },
  { day: 8, materials: [R('plume_orage', 45), R('essence_astrale', 2)] },
  { day: 9, materials: [R('ombre_pure', 50), R('poussiere_etoile', 20)] },
  { day: 10, materials: [R('poussiere_etoile', 40)], item: true },
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
