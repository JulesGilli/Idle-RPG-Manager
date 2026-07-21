import { useMemo } from 'react';
import { canAddClass, MAX_SAME_CLASS } from '@shared/progression/teamComposition';

/** Le strict nécessaire pour appliquer la règle : un id et une classe. */
type Pickable = { id: string; classId: string };

/**
 * Plafond de doublons de classe, côté INTERFACE : dit quels héros doivent être
 * grisés parce que leur classe est déjà au complet dans la sélection.
 *
 * Le serveur refuse déjà ces compositions (cf. `teamComposition.ts`) — ce hook
 * ne fait qu'éviter au joueur de découvrir le refus après coup. Les deux
 * lisent la même règle, donc ils ne peuvent pas diverger.
 *
 * @param heroes tous les héros affichés dans le sélecteur.
 * @param picked ids déjà retenus.
 * @param limit  plafond (doublé pour les grandes formations).
 */
export function useClassLimit(
  heroes: Pickable[],
  picked: string[],
  limit: number = MAX_SAME_CLASS,
) {
  return useMemo(() => {
    const classById = new Map(heroes.map((h) => [h.id, h.classId]));
    const pickedClasses = picked.map((id) => classById.get(id));
    /**
     * Ce héros est-il bloqué par le plafond ? Un héros DÉJÀ retenu ne l'est
     * jamais : il doit rester cliquable pour être retiré de l'équipe.
     */
    const classFull = (heroId: string, classId: string): boolean =>
      !picked.includes(heroId) && !canAddClass(pickedClasses, classId, limit);
    return { classFull, limit };
  }, [heroes, picked, limit]);
}
