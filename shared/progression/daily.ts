/**
 * Récompense journalière (connexion quotidienne).
 *
 * Cycle de 10 jours d'ÉQUIPEMENT. Chaque jour offre un LOT COMPLET : soit une
 * arme de chaque modèle (8), soit une armure de chaque modèle (3), forgées en
 * ULTIME avec le composant d'une zone. La zone monte au fil du cycle :
 *
 *   J1  armes   Z1        J2  armures Z2      J3  armes   Z2
 *   J4  armures Z3        J5  armes   Z3      J6  armures Z4
 *   J7  armes   Z4        J8  armures Z5      J9  armes   Z5
 *   J10 armures Z6  ← le plus gros composant du calendrier
 *
 * La zone 1 n'a que des armes : le calendrier démarre en douceur, puis chaque
 * zone suivante livre sa paire armure → armes. Les objets sont forgés côté
 * serveur (offerts, sans coût) ; le composant de zone fixe la puissance, et
 * l'essence du boss de cette zone (zones 4+) oriente les stats secondaires —
 * comme pour les reliques offertes, sinon le cadeau sortirait mono-stat.
 *
 * Après le jour 10, le cycle repart au jour 1. Rater un jour (écart > 1 jour
 * civil) remet la série à zéro (jour 1). Une seule réclamation par jour (date
 * Europe/Paris, calculée côté serveur — anti-triche).
 *
 * Pur & testable : la logique de date prend des chaînes 'YYYY-MM-DD'.
 */

export const DAILY_CYCLE = 10;

/**
 * Une case du calendrier : un lot d'équipement ultime.
 * `kind` dit quels modèles de FORGE_BASES sont offerts (tous ceux de ce type),
 * `materialId` est l'id du composant de zone qui fixe la puissance et le nom.
 */
export type DailyReward = {
  /** Jour dans le cycle, 1..10. */
  day: number;
  /** Lot offert : toutes les armes, ou toutes les armures. */
  kind: 'weapon' | 'armor';
  /** Composant de forge (id de FORGE_MATERIALS) : zone, puissance, suffixe. */
  materialId: string;
};

// Composant de zone (id de thème forge) par zone.
const Z1 = 'chene'; // zone 1
const Z2 = 'givre'; // zone 2
const Z3 = 'sables'; // zone 3
const Z4 = 'marais'; // zone 4
const Z5 = 'obsidienne'; // zone 5
const Z6 = 'runique'; // zone 6

/** Rareté des objets offerts par le calendrier. */
export const DAILY_RARITY = 'ultimate';

/** Table des récompenses, index 0 = jour 1 … index 9 = jour 10. */
export const DAILY_REWARDS: DailyReward[] = [
  { day: 1, kind: 'weapon', materialId: Z1 },
  { day: 2, kind: 'armor', materialId: Z2 },
  { day: 3, kind: 'weapon', materialId: Z2 },
  { day: 4, kind: 'armor', materialId: Z3 },
  { day: 5, kind: 'weapon', materialId: Z3 },
  { day: 6, kind: 'armor', materialId: Z4 },
  { day: 7, kind: 'weapon', materialId: Z4 },
  { day: 8, kind: 'armor', materialId: Z5 },
  { day: 9, kind: 'weapon', materialId: Z5 },
  { day: 10, kind: 'armor', materialId: Z6 },
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
