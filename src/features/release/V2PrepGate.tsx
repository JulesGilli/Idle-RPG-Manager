import type { ReactNode } from 'react';
import { useRelease, formatCountdown } from './useRelease';
import { UiIcon } from '@/components/synty/GameIcons';

/**
 * Verrou plein-écran « Préparation de la V2 ». Quand `full_lock` est actif ET que la
 * sortie n'est pas encore atteinte, les JOUEURS voient un compte à rebours au lieu
 * du jeu. Les ADMINS passent (bypass intégré à `useRelease().released`). L'écran de
 * connexion/inscription est en amont (RequireAuth) → créer un compte reste possible.
 */
export function V2PrepGate({ children }: { children: ReactNode }) {
  const { locked, released, remainingMs, title } = useRelease();
  // `released` = admin || sortie atteinte. On ne bloque donc QUE les joueurs, et
  // seulement si le verrou plein-écran est explicitement activé.
  if (locked && !released) return <V2PrepScreen remainingMs={remainingMs} title={title} />;
  return <>{children}</>;
}

function V2PrepScreen({ remainingMs, title }: { remainingMs: number; title: string | null }) {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[var(--color-bg)] px-6 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-arcane)]/15">
        <UiIcon name="lock" size={34} color="var(--color-arcane)" />
      </div>

      <h1 className="heading text-3xl sm:text-4xl">Préparation de la V2</h1>
      {title && <p className="mt-2 text-sm text-[var(--color-muted)]">{title}</p>}

      <p className="mt-6 text-xs uppercase tracking-widest text-[var(--color-muted)]">Lancement dans</p>
      <div className="mt-1 font-display text-2xl font-bold tabular-nums text-[var(--color-gold-soft)] sm:text-3xl">
        {remainingMs > 0 ? formatCountdown(remainingMs) : 'imminent…'}
      </div>

      <div className="mt-8 max-w-md rounded-xl border border-[var(--color-edge)] bg-[var(--color-panel)]/60 p-4 text-sm text-[var(--color-muted)]">
        Le royaume se refait une beauté pour la <strong className="text-[var(--color-ink)]">grande mise à jour V2</strong>.
        Ton compte est bien conservé — et parce que tu es là <strong className="text-[var(--color-gold-soft)]">avant le
        lancement</strong>, tu recevras une <strong className="text-[var(--color-gold-soft)]">récompense exclusive</strong> le
        jour J. À très vite !
      </div>
    </div>
  );
}
