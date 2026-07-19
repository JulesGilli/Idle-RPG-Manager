import type { ReactNode } from 'react';
import { UiIcon } from '@/components/synty/GameIcons';
import { BodyPortal } from '@/components/BodyPortal';

/**
 * Popup de confirmation à la DA du jeu (remplace `window.confirm`). Overlay sombre
 * + panneau centré. `danger` teinte le bouton de confirmation en rouge (actions
 * destructives : dissoudre, renvoyer…).
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <BodyPortal>
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="panel w-full max-w-sm p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <h3 className="heading flex items-center gap-2 text-lg">
          <UiIcon name={danger ? 'warning' : 'book'} size={20} color={danger ? 'var(--color-ember)' : 'var(--color-gold-soft)'} />
          {title}
        </h3>
        <div className="mt-2 text-sm text-[var(--color-muted)]">{message}</div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-[var(--color-edge)] px-3 py-1.5 text-sm font-medium text-[var(--color-muted)] transition hover:text-[var(--color-ink)] disabled:opacity-40"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="btn btn-primary text-sm disabled:opacity-50"
            style={danger ? { background: 'var(--color-ember)', color: 'white' } : undefined}
          >
            {busy ? '…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
    </BodyPortal>
  );
}
