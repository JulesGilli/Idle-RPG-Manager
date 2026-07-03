import { Link } from 'react-router-dom';

/**
 * Lien « ressortir » présent en tête de chaque bâtiment du village.
 * Renforce la boucle immersive : on entre dans une boutique, puis on en ressort.
 */
export function BackToVillage() {
  return (
    <Link
      to="/village"
      className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-[var(--color-edge)] px-3 py-1.5 text-xs font-medium text-[var(--color-muted)] transition hover:border-[var(--color-edge-strong)] hover:text-[var(--color-ink)]"
    >
      ← Ressortir au village
    </Link>
  );
}
