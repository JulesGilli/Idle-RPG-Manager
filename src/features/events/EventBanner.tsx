import { Link } from 'react-router-dom';
import { useEvent } from './useEvent';

/** Le boss de la semaine est livré (rubrique Activités → /event) : on annonce son bandeau en semaine. */
const WORLD_BOSS_LIVE = true;

/**
 * Bandeau de l'événement en cours. Le week-end annonce le bonus de carte (double
 * XP/butin) ; en semaine il annoncera le boss de la semaine (une fois livré).
 * Purement informatif, piloté par l'heure serveur (voir `useEvent`). Masqué si la
 * rotation est coupée.
 */
export function EventBanner() {
  const { event } = useEvent();

  if (event.weekend) {
    const xp = event.xpMult;
    const drop = event.dropMult;
    return (
      <div className="shrink-0 border-b border-[var(--color-gold)]/30 bg-gradient-to-r from-[var(--color-gold)]/20 via-[#f0c96b]/10 to-[var(--color-arcane)]/15">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-sm">
          <span className="inline-flex items-center gap-1.5 font-display font-semibold text-[var(--color-ink)]">
            <span aria-hidden>🎉</span>
            Week-end bonus
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/25 px-2.5 py-0.5 font-medium text-[var(--color-gold-soft)]">
            XP ×{xp} &amp; butin ×{drop} sur la carte
          </span>
        </div>
      </div>
    );
  }

  if (event.worldBossActive && WORLD_BOSS_LIVE) {
    return (
      <Link
        to="/event"
        className="block shrink-0 border-b border-[var(--color-danger)]/30 bg-gradient-to-r from-[var(--color-danger)]/20 via-[#b4453f]/10 to-[var(--color-arcane)]/15 transition hover:brightness-125"
      >
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-sm">
          <span className="inline-flex items-center gap-1.5 font-display font-semibold text-[var(--color-ink)]">
            <span aria-hidden>⚔️</span>
            Boss de la semaine
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/25 px-2.5 py-0.5 font-medium text-[var(--color-gold-soft)]">
            Frappe-le pour débloquer les paliers communs
          </span>
        </div>
      </Link>
    );
  }

  return null;
}
