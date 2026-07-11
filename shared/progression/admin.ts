/**
 * Identifiant du compte admin (le tien). Sert notamment de BYPASS des verrous de
 * sortie (V1.x) : l'admin voit et utilise les nouveautés en avance pour les tester
 * en prod, sans les exposer aux joueurs (qui restent gatés par `release_at`).
 * Partagé front + Edge Functions.
 */
export const ADMIN_ID = 'dfc646d3-f9c5-479e-8812-dca9d2265243';

/** Ce joueur est-il l'admin ? */
export function isAdmin(userId: string | null | undefined): boolean {
  return userId === ADMIN_ID;
}
