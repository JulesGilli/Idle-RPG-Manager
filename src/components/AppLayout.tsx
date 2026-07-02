import { NavLink, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { useProfile } from '@/hooks/useProfile';

const navItems = [
  { to: '/', label: 'Carte', icon: '🗺️', end: true },
  { to: '/squad', label: 'Escouade', icon: '⚔️', end: false },
  { to: '/inventory', label: 'Sac', icon: '🎒', end: false },
  { to: '/village', label: 'Village', icon: '🏰', end: false },
];

export function AppLayout() {
  const signOut = useAuthStore((s) => s.signOut);
  const { data: profile } = useProfile();

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4">
      <header className="sticky top-0 z-30 -mx-4 mb-6 border-b border-[var(--color-edge)] bg-[#08070d]/80 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl drop-shadow-[0_0_10px_rgba(232,182,74,0.5)]">🐉</span>
            <span className="font-display text-lg font-bold tracking-wide text-[var(--color-gold-soft)]">
              Idle-RPG
            </span>
          </div>

          <nav className="hidden gap-1 sm:flex">
            {navItems.map((item) => (
              <NavItem key={item.to} {...item} />
            ))}
          </nav>

          <div className="flex items-center gap-3 text-sm">
            {profile && (
              <span
                className="flex items-center gap-1.5 rounded-full border border-[var(--color-gold)]/30 bg-[var(--color-gold)]/10 px-3 py-1 font-display font-semibold text-[var(--color-gold-soft)]"
                title="Or"
              >
                <span>💰</span>
                <span className="tabular-nums">{profile.gold}</span>
              </span>
            )}
            {profile && (
              <span className="hidden text-[var(--color-muted)] md:inline">
                {profile.display_name}
              </span>
            )}
            <button onClick={() => void signOut()} className="btn btn-ghost px-3 py-1.5 text-xs">
              Quitter
            </button>
          </div>
        </div>

        {/* Nav mobile */}
        <nav className="mt-3 flex gap-1 overflow-x-auto sm:hidden">
          {navItems.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </nav>
      </header>

      <main className="flex-1 pb-16">
        <Outlet />
      </main>

      <footer className="py-6 text-center text-xs text-[var(--color-muted)]/60">
        Idle-RPG Manager · 100% PvE
      </footer>
    </div>
  );
}

function NavItem({
  to,
  label,
  icon,
  end,
}: {
  to: string;
  label: string;
  icon: string;
  end: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
          isActive
            ? 'bg-[var(--color-arcane)]/15 text-white shadow-[inset_0_0_0_1px_rgba(139,124,246,0.4)]'
            : 'text-[var(--color-muted)] hover:bg-white/5 hover:text-neutral-200'
        }`
      }
    >
      <span>{icon}</span>
      {label}
    </NavLink>
  );
}
