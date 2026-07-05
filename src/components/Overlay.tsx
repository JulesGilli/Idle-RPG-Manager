import type { ReactNode } from 'react';

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
    <div
      className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="panel anim-pop max-h-[86vh] w-full max-w-xl overflow-y-auto p-5"
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
  );
}
