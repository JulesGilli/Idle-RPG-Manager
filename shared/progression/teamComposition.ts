/**
 * COMPOSITION D'ÉQUIPE — plafond de doublons de classe.
 *
 * Une escouade de combat ne peut aligner que `MAX_SAME_CLASS` héros d'une même
 * classe. Sans ce plafond, la composition optimale est toujours « cinq fois la
 * classe la plus forte du moment » : le méta se réduit à un seul nom, et tout le
 * reste du roster devient décoratif.
 *
 * NE S'APPLIQUE PAS aux activités de GUILDE : on y joue avec ce que les membres
 * ont sous la main, imposer une diversité de classes reviendrait à punir les
 * petites guildes pour la composition de leur effectif.
 *
 * Pur et partagé front + Edge Function : le serveur REFUSE une équipe hors
 * règle, le front se contente de griser ce qui serait refusé. Les deux lisent
 * la même constante — une limite qui ne vivrait que dans l'interface se
 * contournerait à la main.
 */

/** Héros d'une même classe autorisés dans une escouade de combat. */
export const MAX_SAME_CLASS = 2;

/**
 * Plafond des GRANDES formations (champs de bataille, 10 héros) : le double.
 * Garder 2 sur une équipe deux fois plus grande imposerait au moins cinq
 * classes distinctes, ce que peu de rosters peuvent fournir.
 */
export const MAX_SAME_CLASS_LARGE = MAX_SAME_CLASS * 2;

/** Occurrences de chaque classe dans une liste (les entrées vides sont ignorées). */
export function classCounts(classIds: (string | null | undefined)[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of classIds) {
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/**
 * La classe `classId` peut-elle encore être AJOUTÉE à cette composition ?
 *
 * `current` = classes déjà retenues. Sert au front pour griser les héros dont la
 * classe est déjà au plafond.
 */
export function canAddClass(
  current: (string | null | undefined)[],
  classId: string,
  limit: number = MAX_SAME_CLASS,
): boolean {
  return (classCounts(current).get(classId) ?? 0) < limit;
}

export type TeamClassCheck = { ok: true } | { ok: false; classId: string; count: number; limit: number };

/**
 * Valide une composition entière. Renvoie la PREMIÈRE classe en excès — le
 * serveur n'a besoin que d'une raison de refus, et le message la nomme.
 */
export function checkTeamClasses(
  classIds: (string | null | undefined)[],
  limit: number = MAX_SAME_CLASS,
): TeamClassCheck {
  for (const [classId, count] of classCounts(classIds)) {
    if (count > limit) return { ok: false, classId, count, limit };
  }
  return { ok: true };
}

/** Message d'erreur unique, pour que serveur et interface disent la même chose. */
export function tooManySameClassError(limit: number = MAX_SAME_CLASS): string {
  return `${limit} héros maximum de la même classe dans une équipe`;
}
