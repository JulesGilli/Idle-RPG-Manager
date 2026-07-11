import { useState } from 'react';
import { UiIcon } from '@/components/synty/GameIcons';

/** Date/heure du reset de progression (Europe/Paris). Ajuste ici si besoin. */
export const RESET_AT = '2026-07-17T19:00:00+02:00';

function daysUntil(target: string): number {
  const ms = new Date(target).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

function whenLabel(days: number): string {
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return 'demain';
  return `dans ${days} jours`;
}

/** Bandeau d'annonce : reset de progression à venir. Fermable (par session). */
export function ResetBanner() {
  const [open, setOpen] = useState(true);
  const days = daysUntil(RESET_AT);
  if (!open || days < 0) return null;

  return (
    <div className="anim-fade flex items-start gap-3 border-b border-[var(--color-gold)]/30 bg-[var(--color-gold)]/10 px-4 py-2.5 text-sm sm:px-6">
      <UiIcon name="warning" size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1 text-[var(--color-ink)]/90">
        <span className="font-semibold text-[var(--color-gold-soft)]">
          Réinitialisation de la progression {whenLabel(days)}.
        </span>{' '}
        Des exploits, bugs et soucis d'équilibrage ont affecté l'expérience — on repart sur une base
        saine. Après le reset : du contenu jusqu'à la <strong>fin de l'arc 2 (20 zones)</strong>… et
        quelques surprises. Tu peux continuer à jouer d'ici là&nbsp;!
      </div>
      <button
        onClick={() => setOpen(false)}
        aria-label="Fermer"
        className="shrink-0 text-[var(--color-muted)] transition hover:text-[var(--color-ink)]"
      >
        ✕
      </button>
    </div>
  );
}
