/**
 * LA RAFFINERIE (Arc 2) — un puits d'or qui améliore le rendement de la carte.
 *
 * Un bâtiment débloqué en Arc 2 : on y déverse de l'or pour monter des niveaux,
 * et chaque niveau augmente le TAUX DE DROP des ressources de farm sur toute la
 * carte du monde (multiplicateur appliqué au butin, comme le bonus d'événement
 * du week-end). C'est le grand sink d'or du end-game : en Arc 2 l'or coule
 * (`mapRewardMult` ×6) sans avoir grand-chose à financer — la Raffinerie lui
 * redonne une destination.
 *
 * PUR & testable : ni DB ni horloge. L'edge function `resource-refinery` lit le
 * niveau et l'or, applique `refineryUpgradeCost`, et `resolve-deployment` lit le
 * niveau pour multiplier le butin via `refineryDropMult`.
 */

/** Arc où la Raffinerie se débloque. Avant, le bâtiment n'existe pas. */
export const REFINERY_MIN_ARC = 2;

/** Niveau maximum. Au plafond, plus rien à financer — le sink a une fin. */
export const REFINERY_MAX_LEVEL = 20;

/**
 * Gain de drop par niveau (fraction). +5 %/niveau, soit +100 % (butin ×2) au
 * niveau max. Volontairement mesuré : c'est un bonus PERMANENT et cumulatif avec
 * le farm, pas un coup de boost. Réglable ici, seul foyer de la valeur.
 */
export const REFINERY_BONUS_PER_LEVEL = 0.05;

/**
 * Coût en or pour l'upgrade « énorme » demandée : croissance géométrique forte.
 * Passer de `level` à `level + 1`. Base 250k, ×1,5 par niveau — le dernier
 * niveau coûte ~500 M et la montée complète ~1,6 milliard d'or, un vrai objectif
 * de fin de partie plutôt qu'un achat d'après-midi.
 */
export const REFINERY_BASE_COST = 250_000;
export const REFINERY_COST_GROWTH = 1.5;

/** Niveau borné à [0, MAX]. */
function clampLevel(level: number): number {
  return Math.max(0, Math.min(REFINERY_MAX_LEVEL, Math.floor(level)));
}

/** Multiplicateur de drop de la carte au niveau donné (1 = aucun bonus). */
export function refineryDropMult(level: number): number {
  return 1 + clampLevel(level) * REFINERY_BONUS_PER_LEVEL;
}

/** Bonus de drop AFFICHÉ (en % entiers) au niveau donné. */
export function refineryBonusPct(level: number): number {
  return Math.round(clampLevel(level) * REFINERY_BONUS_PER_LEVEL * 100);
}

/** Le bâtiment est-il au niveau maximum ? */
export function refineryMaxed(level: number): boolean {
  return clampLevel(level) >= REFINERY_MAX_LEVEL;
}

/**
 * Coût en or pour passer de `level` à `level + 1`. `Infinity` au plafond
 * (aucun niveau à acheter) — l'appelant le lit comme « indisponible ».
 */
export function refineryUpgradeCost(level: number): number {
  const l = clampLevel(level);
  if (l >= REFINERY_MAX_LEVEL) return Infinity;
  return Math.round(REFINERY_BASE_COST * Math.pow(REFINERY_COST_GROWTH, l));
}
