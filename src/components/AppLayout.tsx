import { NavLink, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { useProfile } from '@/hooks/useProfile';

const navItems = [
  { to: '/', label: 'Escouade', end: true },
  { to: '/dungeons', label: 'Donjons', end: false },
  { to: '/leaderboard', label: 'Classement', end: false },
];

export function AppLayout() {
  const signOut = useAuthStore((s) => s.signOut);
  const { data: profile } = useProfile();

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col">
      <header className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
        <nav className="flex gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-neutral-800 text-white'
                    : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          {profile && <span className="text-neutral-400">{profile.display_name}</span>}
          <button
            onClick={() => void signOut()}
            className="rounded-md border border-neutral-700 px-3 py-2 text-neutral-300 transition hover:border-neutral-500 hover:text-white"
          >
            Déconnexion
          </button>
        </div>
      </header>

      <main className="flex-1 px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
