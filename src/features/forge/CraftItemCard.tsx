import type { ReactNode } from 'react';

/**
 * Carte d'un item à fabriquer, dans la liste d'un atelier. Cliquer ouvre la
 * fenêtre de craft. Même présentation dans la Forge, la Joaillerie et l'Autel.
 */
export function CraftItemCard({
  icon,
  name,
  sub,
  badge,
  onClick,
}: {
  icon: ReactNode;
  name: string;
  sub?: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="panel panel-hover flex items-center gap-3 p-3 text-left transition hover:border-[var(--color-arcane)]/60"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/[0.04]">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-sm font-semibold text-[var(--color-ink)]">
          {name}
        </span>
        {sub && <span className="text-[11px] text-[var(--color-muted)]">{sub}</span>}
        {badge && (
          <span className="chip mt-0.5 inline-block bg-[var(--color-arcane)]/15 text-[9px] font-semibold text-[var(--color-arcane)]">
            {badge}
          </span>
        )}
      </span>
      <span className="shrink-0 text-[var(--color-muted)]">→</span>
    </button>
  );
}
