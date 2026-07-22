import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useEvent } from './useEvent';

/** Le boss de la semaine est livré (rubrique Activités → /event) : on annonce son bandeau en semaine. */
const WORLD_BOSS_LIVE = true;

/**
 * Clé de rejet du bandeau : type d'event + jour (Paris). Une fois fermé, le
 * bandeau reste masqué pour CE jour et CE type ; il réapparaît le lendemain, ou
 * tout de suite si l'événement change de nature. On évite ainsi le « masqué à
 * vie » sans harceler le joueur à chaque rechargement.
 */
function bannerDismissKey(kind: string): string {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(Date.now());
  return `event-banner-dismissed:${kind}:${day}`;
}

/** Petite croix de fermeture, superposée à droite du bandeau (PC + mobile). */
function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        // Le bandeau du boss est un <Link> : sans ça, fermer déclencherait la
        // navigation vers /event.
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
      title="Masquer ce bandeau"
      aria-label="Masquer ce bandeau"
      className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-[var(--color-muted)] transition hover:bg-white/10 hover:text-[var(--color-ink)]"
    >
      <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
      </svg>
    </button>
  );
}

/**
 * Bandeau de l'événement en cours. Le week-end annonce le bonus de carte (double
 * XP/butin) ; en semaine il annonce le boss de la semaine. Purement informatif,
 * piloté par l'heure serveur (voir `useEvent`). Masqué si la rotation est coupée
 * ou si le joueur l'a fermé pour la journée.
 */
export function EventBanner() {
  const { event } = useEvent();
  // On relit le rejet à CHAQUE rendu (pas un state figé) : la clé dépend du type
  // d'event, qui peut changer. `bump` ne sert qu'à re-render après fermeture.
  const [, bump] = useState(0);
  const key = bannerDismissKey(event.kind);
  let dismissed = false;
  try {
    dismissed = localStorage.getItem(key) === '1';
  } catch {
    /* stockage indisponible : le bandeau reste affiché */
  }
  if (dismissed) return null;

  const close = () => {
    try {
      localStorage.setItem(key, '1');
    } catch {
      /* stockage indisponible : on masque au moins pour ce rendu */
    }
    bump((n) => n + 1);
  };

  if (event.weekend) {
    const xp = event.xpMult;
    const drop = event.dropMult;
    return (
      <div className="relative shrink-0 border-b border-[var(--color-gold)]/30 bg-gradient-to-r from-[var(--color-gold)]/20 via-[#f0c96b]/10 to-[var(--color-arcane)]/15">
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 px-9 py-1 text-center text-xs sm:gap-x-3 sm:px-10 sm:py-2 sm:text-sm">
          <span className="inline-flex items-center gap-1.5 font-display font-semibold text-[var(--color-ink)]">
            <span aria-hidden>🎉</span>
            Week-end bonus
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/25 px-2.5 py-0.5 font-medium text-[var(--color-gold-soft)]">
            XP ×{xp} &amp; butin ×{drop} sur la carte
          </span>
        </div>
        <CloseButton onClose={close} />
      </div>
    );
  }

  if (event.worldBossActive && WORLD_BOSS_LIVE) {
    return (
      <div className="relative shrink-0 border-b border-[var(--color-danger)]/30 bg-gradient-to-r from-[var(--color-danger)]/20 via-[#b4453f]/10 to-[var(--color-arcane)]/15">
        <Link to="/event" className="block transition hover:brightness-125">
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 px-9 py-1 text-center text-xs sm:gap-x-3 sm:px-10 sm:py-2 sm:text-sm">
            <span className="inline-flex items-center gap-1.5 font-display font-semibold text-[var(--color-ink)]">
              <span aria-hidden>⚔️</span>
              Boss de la semaine
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-black/25 px-2.5 py-0.5 font-medium text-[var(--color-gold-soft)]">
              Frappe-le pour débloquer les paliers communs
            </span>
          </div>
        </Link>
        <CloseButton onClose={close} />
      </div>
    );
  }

  return null;
}
