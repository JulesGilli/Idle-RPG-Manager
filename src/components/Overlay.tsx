import type { ReactNode } from 'react';
import { BodyPortal } from '@/components/BodyPortal';

/**
 * Fenêtre modale centrée (overlay) réutilisable. Clic sur le fond ou sur ✕ ferme.
 * Utilisée par les ateliers de craft : on clique un item à fabriquer → cette
 * fenêtre s'ouvre pour choisir les matériaux.
 */
export function Overlay({
  title,
  onClose,
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <BodyPortal>
    <div
      className="anim-fade fixed inset-0 z-50 flex items-stretch justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="panel anim-pop h-full max-h-[100dvh] w-full max-w-xl overflow-y-auto rounded-none p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:h-auto sm:max-h-[86vh] sm:rounded-[var(--radius-xl2)] sm:p-5 sm:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="heading text-lg">{title}</h3>
          <button
            onClick={onClose}
            className="shrink-0 rounded-md px-2 py-0.5 text-[var(--color-muted)] transition hover:bg-white/5 hover:text-[var(--color-ink)]"
            title="Fermer"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
    </BodyPortal>
  );
}
