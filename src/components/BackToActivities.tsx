import { Link } from 'react-router-dom';

/**
 * Lien « revenir au hub Activités », présent en tête de chaque activité (carte,
 * tour, donjon, expéditions, arène, boss d'arc). Pendant du BackToVillage :
 * simplifie la navigation, on ressort toujours au même endroit.
 */
export function BackToActivities() {
  return (
    <Link
      to="/"
      className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-[var(--color-edge)] px-3 py-1.5 text-xs font-medium text-[var(--color-muted)] transition hover:border-[var(--color-edge-strong)] hover:text-[var(--color-ink)]"
    >
      ← Retour aux activités
    </Link>
  );
}
