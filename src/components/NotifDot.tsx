/**
 * Gommette de notification : petit point rouge « une action t'attend ici ».
 * Positionné en absolu — le parent doit être `relative`. Reprend le style du
 * point de récompense journalière (bg ember + anneau couleur du panneau).
 */
export function NotifDot({
  show,
  className = '',
  title,
}: {
  show: boolean;
  /** Positionnement (ex. `-right-1 -top-1`). */
  className?: string;
  title?: string;
}) {
  if (!show) return null;
  return (
    <span
      title={title}
      aria-label={title ?? 'Action disponible'}
      className={`pointer-events-none absolute h-2.5 w-2.5 rounded-full bg-[var(--color-ember)] ring-2 ring-[var(--color-panel)] ${className}`}
    />
  );
}
