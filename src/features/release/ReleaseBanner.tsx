import { useRelease, formatCountdown } from './useRelease';

/**
 * Bandeau d'annonce d'une mise à jour programmée. Visible tant que l'heure serveur
 * n'a pas atteint `release_at` ; disparaît tout seul à la bascule. Purement informatif.
 */
export function ReleaseBanner() {
  const { released, remainingMs, version, title, releaseAtMs } = useRelease();

  // Rien à annoncer (aucune sortie programmée) ou déjà sortie → pas de bandeau.
  if (releaseAtMs == null || released) return null;

  return (
    <div className="shrink-0 border-b border-[var(--color-arcane)]/30 bg-gradient-to-r from-[var(--color-arcane)]/20 via-[#8b7cf6]/15 to-[var(--color-gold)]/15">
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-sm">
        <span className="inline-flex items-center gap-1.5 font-display font-semibold text-[var(--color-ink)]">
          <span aria-hidden>🚀</span>
          {version ?? 'Mise à jour'}
          {title ? <span className="font-normal text-[var(--color-muted)]">— {title}</span> : null}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-black/25 px-2.5 py-0.5 font-medium text-[var(--color-gold-soft)]">
          <span className="text-[var(--color-muted)]">arrive dans</span>
          <span className="tabular-nums">{formatCountdown(remainingMs)}</span>
        </span>
      </div>
    </div>
  );
}
