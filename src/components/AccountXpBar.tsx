import { useAccount } from '@/hooks/useAccount';
import { UiIcon } from '@/components/synty/GameIcons';

/**
 * Barre de progression du niveau de COMPTE, pensée pour se glisser sous la
 * description d'un en-tête d'écran (Forge, Village…). Affiche le niveau, le titre
 * de rang, la jauge d'XP et le détail chiffré.
 */
export function AccountXpBar({ className = '' }: { className?: string }) {
  const account = useAccount();
  const pct = Math.min(100, Math.round((account.xpInLevel / Math.max(1, account.xpForLevel)) * 100));
  return (
    <div className={`max-w-xs ${className}`}>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1 font-display font-semibold text-[var(--color-ink)]">
          <UiIcon name="xp" size={12} /> Compte Nv.{account.level}
          <span className="font-normal text-[var(--color-muted)]">· {account.title}</span>
        </span>
        <span className="tabular-nums text-[var(--color-muted)]">
          {account.xpInLevel}/{account.xpForLevel} XP
        </span>
      </div>
      <span className="block h-1.5 overflow-hidden rounded-full bg-black/40">
        <span
          className="block h-full rounded-full bg-[var(--color-arcane)] transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </span>
    </div>
  );
}
