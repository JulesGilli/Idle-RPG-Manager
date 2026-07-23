/**
 * Récompense journalière (connexion quotidienne).
 *
 * Cycle de 3 jours de TYPE d'équipement (arme → armure → relique → arme…),
 * offert en ULTIME, un lot complet à chaque fois (toutes les armes, toutes les
 * armures, ou les trois modèles de relique). La ZONE n'est plus une valeur
 * fixe d'un calendrier : c'est la zone la PLUS LOIN ATTEINTE par le joueur
 * dans son arc courant (cf. `furthestZoneOf` côté serveur, seul endroit qui a
 * accès à sa progression). Un joueur en zone 8 de l'arc 1 reçoit du zone 8
 * d'arc 1 ; un joueur en zone 2 de l'arc 2 reçoit du zone 2 d'arc 2 — jamais
 * un calendrier générique déconnecté de sa vraie avancée.
 *
 * Rater un jour (écart > 1 jour civil) remet la série à zéro (jour 1). Une
 * seule réclamation par jour (date Europe/Paris, calculée côté serveur —
 * anti-triche).
 *
 * Pur & testable : la logique de date prend des chaînes 'YYYY-MM-DD'. Le choix
 * du TYPE d'objet est pur aussi (`kindForDay`) ; la ZONE, elle, dépend de la
 * base et vit côté Edge Function.
 */

/** Type d'équipement offert un jour donné. */
export type DailyRewardKind = 'weapon' | 'armor' | 'relic';

/** Rotation des types, dans l'ordre. */
export const DAILY_KIND_CYCLE: DailyRewardKind[] = ['weapon', 'armor', 'relic'];

/** Longueur du cycle (jours avant de reboucler sur « arme »). */
export const DAILY_CYCLE = DAILY_KIND_CYCLE.length;

/** Rareté des objets offerts par le calendrier. */
export const DAILY_RARITY = 'ultimate';

/** Type offert pour un jour du cycle (1-based, comme `DailyClaimState.dayIndex`). */
export function kindForDay(day: number): DailyRewardKind {
  const idx = (Math.max(1, day) - 1) % DAILY_KIND_CYCLE.length;
  return DAILY_KIND_CYCLE[idx]!;
}

/** État persistant (table daily_claims). */
export type DailyClaimState = {
  /** Dernière date réclamée 'YYYY-MM-DD' (null = jamais). */
  lastClaimDate: string | null;
  /** Dernier jour réclamé dans le cycle (0 = jamais, sinon 1..DAILY_CYCLE). */
  dayIndex: number;
};

/** Nombre de jours civils entre deux dates 'YYYY-MM-DD' (b - a). */
export function daysBetween(a: string, b: string): number {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  return Math.round((db - da) / 86_400_000);
}

/** Jour du cycle (1..DAILY_CYCLE) qui serait réclamé MAINTENANT, selon l'état et la date du jour. */
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
  /** Le jour (1..DAILY_CYCLE) réclamable maintenant (ou déjà réclamé aujourd'hui). */
  day: number;
};

/** Peut-on réclamer aujourd'hui ? Et quel jour du cycle ? */
export function dailyStatus(state: DailyClaimState, today: string): DailyStatus {
  if (state.lastClaimDate === today) {
    return { canClaim: false, alreadyClaimedToday: true, day: state.dayIndex };
  }
  return { canClaim: true, alreadyClaimedToday: false, day: nextClaimDay(state, today) };
}
