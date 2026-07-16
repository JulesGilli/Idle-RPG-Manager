/**
 * Statut admin — la liste des IDs autorisés vient de la DB (`app_config.admin_ids`,
 * exposée via le RPC `release_info()` côté front, lue directement par les Edge
 * Functions). Sert notamment de BYPASS des verrous de sortie (V1.x) : un admin voit
 * et utilise les nouveautés en avance pour les tester en prod, sans les exposer aux
 * joueurs (qui restent gatés par `release_at`). Fonction pure, partagée front + Edge
 * Functions — les appelants sont responsables de fournir la liste.
 */
export function isAdmin(userId: string | null | undefined, adminIds: readonly string[]): boolean {
  return !!userId && adminIds.includes(userId);
}
