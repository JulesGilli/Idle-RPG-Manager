import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useArc } from '@/features/arc/useArc';
import { arcTuning } from '@shared/progression/arc.ts';
import { useAuthStore } from '@/store/authStore';
import { useProfile } from '@/hooks/useProfile';
import { useAccount } from '@/hooks/useAccount';
import { useUnlocks } from '@/hooks/useUnlocks';
import { useActionAlerts } from '@/hooks/useActionAlerts';
import { useReturnSummary } from '@/hooks/useReturnSummary';
import { ReturnSummaryModal } from '@/features/welcome/ReturnSummaryModal';
import { NotifDot } from '@/components/NotifDot';
import { SyntyGlyph, SyntyImg } from '@/components/synty/SyntyIcon';
import { UiIcon } from '@/components/synty/GameIcons';
import { DailyRewardIcon, RedeemTicketIcon } from '@/components/icons/AppSvgIcons';
import { syntyUrl, MAP_ART } from '@/lib/synty';
import { ACTIVITY_UNLOCKS, type ActivityKey } from '@shared/progression/account.ts';
import { UnlockTutorials } from '@/features/onboarding/UnlockTutorials';
import { ChatWidget } from '@/features/chat/ChatWidget';
import { AdminPanel } from '@/features/admin/AdminPanel';
import { DailyRewardModal } from '@/features/daily/DailyRewardModal';
import { useDailyReward } from '@/features/daily/useDailyReward';
import { LeaderboardModal } from '@/features/leaderboard/LeaderboardModal';
import { RedeemModal } from '@/features/redeem/RedeemModal';
import { ChangelogModal } from '@/features/changelog/ChangelogModal';
import { ChoosePseudoModal } from '@/features/onboarding/ChoosePseudoModal';
import { TourSpotlight } from '@/features/tour/TourSpotlight';

type NavEntry = { to: string; label: string; glyph: string; end?: boolean; activity?: ActivityKey; tour?: string };

// Libellés FR de chaque activité (pour l'indice « prochain déblocage » du badge compte).
const ACTIVITY_LABELS: Record<ActivityKey, string> = {
  inventory: 'Sac',
  village: 'Village',
  forge: 'Forge',
  tavern: 'Taverne',
  library: 'Bibliothèque',
  encyclopedia: 'Encyclopédie',
  jewelry: 'Joaillerie',
  relic: 'Reliques',
  tower: 'La Tour',
  dungeon: 'Donjons',
  arc_boss: "Boss d'arc",
  expedition: 'Expéditions',
  guild: 'Guilde',
  arena: 'Arène',
};

// Navigation principale allégée : 4 pôles. `activity` absent = toujours dispo.
// - Activités : hub regroupant carte, tour, donjons, expéditions, arène, boss d'arc.
// - Village : hub des bâtiments utilitaires (forge, biblio, taverne, guilde…).
const navItems: NavEntry[] = [
  { to: '/', label: 'Activités', glyph: syntyUrl.inv('Swords01'), end: true, tour: 'nav-activites' },
  { to: '/inventory', label: 'Équipe', glyph: syntyUrl.inv('Backpack01'), tour: 'nav-equipe' },
  { to: '/village', label: 'Village', glyph: syntyUrl.map('Home01'), activity: 'village', tour: 'nav-village' },
];

export function AppLayout() {
  const signOut = useAuthStore((s) => s.signOut);
  const { data: profile } = useProfile();
  const account = useAccount();
  const unlocks = useUnlocks();
  const { data: daily } = useDailyReward();
  const alerts = useActionAlerts();
  const navigate = useNavigate();
  const { currentArc } = useArc();
  const arc = arcTuning(currentArc);
  const [panel, setPanel] = useState<'daily' | 'leaderboard' | 'redeem' | 'changelog' | null>(null);

  // Thème par arc : on expose l'accent de l'arc sur la racine et on marque le
  // numéro d'arc. Le CSS (index.css) re-teinte l'accent global dès l'arc 2 ;
  // l'arc 1 reste strictement identique à aujourd'hui (aucune règle appliquée).
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--color-arc-accent', arc.accent);
    root.dataset.arc = String(currentArc);
    return () => {
      root.style.removeProperty('--color-arc-accent');
      delete root.dataset.arc;
    };
  }, [currentArc, arc.accent]);

  // Écran de retour idle : une fois par session, si quelque chose t'attend.
  const returnSummary = useReturnSummary();
  const [showReturn, setShowReturn] = useState(false);
  useEffect(() => {
    if (!returnSummary.ready || returnSummary.count === 0) return;
    if (sessionStorage.getItem('return-summary-shown')) return;
    sessionStorage.setItem('return-summary-shown', '1');
    setShowReturn(true);
  }, [returnSummary.ready, returnSummary.count]);

  const items = navItems.map((item) => ({
    ...item,
    locked: item.activity ? !unlocks.unlocked(item.activity) : false,
    reqLevel: item.activity ? ACTIVITY_UNLOCKS[item.activity] : 0,
    // Gommette « action dispo » : Activités (donjon/expé prêts), Village (recrue).
    badge: item.to === '/' ? alerts.activities : item.to === '/village' ? alerts.village : false,
  }));

  // Prochain déblocage lié au NIVEAU (le Sac dépend du 1er matériau, on l'exclut ici).
  // Balayé sur TOUTES les activités (plus seulement la nav, désormais allégée).
  const nextLocked = (Object.keys(ACTIVITY_UNLOCKS) as ActivityKey[])
    .filter((a) => a !== 'inventory' && !unlocks.unlocked(a))
    .map((a) => ({ label: ACTIVITY_LABELS[a], lvl: ACTIVITY_UNLOCKS[a] }))
    .sort((a, b) => a.lvl - b.lvl)[0];

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[var(--color-bg)] text-[var(--color-ink)]">
      {/* Sidebar (desktop / tablette) */}
      <aside className="hidden shrink-0 flex-col border-r border-[var(--color-edge)] bg-[var(--color-panel)] sm:flex sm:w-[76px] lg:w-56">
        <div className="flex h-16 items-center gap-2.5 border-b border-[var(--color-edge)] px-4 lg:px-5">
          <SyntyImg src={MAP_ART.dragon} size={28} />
          <span className="hidden font-display text-lg font-extrabold tracking-tight text-[var(--color-gold-soft)] lg:inline">
            Idle-RPG
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-2 lg:p-3">
          {items.map((item) => (
            <SidebarItem key={item.to} {...item} />
          ))}
        </nav>

        <div className="border-t border-[var(--color-edge)] p-2 lg:p-3">
          <button
            onClick={() => void signOut()}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--color-muted)] transition hover:bg-white/5 hover:text-[var(--color-ink)] lg:justify-start"
            title="Quitter"
          >
            <UiIcon name="leave" size={20} color="currentColor" />
            <span className="hidden lg:inline">Quitter</span>
          </button>
        </div>
      </aside>

      {/* Colonne principale */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--color-edge)] bg-[var(--color-panel)] px-4 sm:h-16 sm:px-6">
          {/* Logo mobile (sidebar cachée) */}
          <div className="flex items-center gap-2 sm:hidden">
            <SyntyImg src={MAP_ART.dragon} size={22} />
            <span className="font-display text-base font-extrabold tracking-tight text-[var(--color-gold-soft)]">
              Idle-RPG
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2 text-sm sm:gap-3">
            <button
              onClick={() => navigate('/arc')}
              title={`Arc actuel : ${arc.region} — changer d'arc`}
              className="hidden h-9 items-center gap-1.5 rounded-lg border px-3 font-display text-xs font-semibold transition sm:flex"
              style={{
                borderColor: `${arc.accent}40`,
                background: `${arc.accent}1a`,
                color: arc.accent,
              }}
            >
              <UiIcon name="dragon" size={14} color="currentColor" />
              <span className="hidden lg:inline">{arc.region}</span>
              <span className="lg:hidden">Arc {currentArc}</span>
            </button>
            <button
              onClick={() => setPanel('daily')}
              title="Récompense journalière"
              className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-gold)]/25 bg-[var(--color-gold)]/10 transition hover:bg-[var(--color-gold)]/20"
            >
              <DailyRewardIcon size={14} color="var(--color-gold-soft)" />
              {daily?.canClaim && (
                <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[var(--color-ember)] ring-2 ring-[var(--color-panel)]" />
              )}
            </button>
            <button
              onClick={() => setPanel('leaderboard')}
              title="Classement global"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-arcane)]/25 bg-[var(--color-arcane)]/10 transition hover:bg-[var(--color-arcane)]/20"
            >
              <UiIcon name="leaderboard" size={20} />
            </button>
            <button
              onClick={() => setPanel('redeem')}
              title="Codes de récompense"
              className="hidden h-9 w-9 items-center justify-center rounded-lg border border-[#5fd39b]/25 bg-[#5fd39b]/10 transition hover:bg-[#5fd39b]/20 sm:flex"
            >
              <RedeemTicketIcon size={14} color="#5fd39b" />
            </button>
            <button
              onClick={() => setPanel('changelog')}
              title="Nouveautés"
              className="hidden h-9 w-9 items-center justify-center rounded-lg border border-[#8b7cf6]/25 bg-[#8b7cf6]/10 transition hover:bg-[#8b7cf6]/20 sm:flex"
            >
              <UiIcon name="changelog" size={16} />
            </button>
            <AccountBadge
              level={account.level}
              title={account.title}
              xpInLevel={account.xpInLevel}
              xpForLevel={account.xpForLevel}
              nextUnlock={nextLocked ? `${nextLocked.label} (Nv.${nextLocked.lvl})` : null}
            />
            {profile && (
              <span
                className="flex items-center gap-1.5 rounded-lg border border-[var(--color-gold)]/25 bg-[var(--color-gold)]/10 px-3 py-1.5 font-display font-semibold text-[var(--color-gold-soft)]"
                title="Or"
              >
                <UiIcon name="gold" size={15} />
                <span className="tabular-nums">{profile.gold}</span>
              </span>
            )}
            {profile && (
              <span className="hidden text-[var(--color-muted)] md:inline">
                {profile.display_name}
              </span>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-5 pb-24 sm:px-6 sm:py-6 sm:pb-6">
          <Outlet />
        </main>
      </div>

      {/* Bottom bar (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-[var(--color-edge)] bg-[var(--color-panel)] pb-[env(safe-area-inset-bottom)] sm:hidden">
        {items.map((item) => (
          <BottomItem key={item.to} {...item} />
        ))}
      </nav>

      {/* 1re connexion : choix du pseudo (bloquant, par-dessus tout le reste). */}
      {profile && profile.pseudo_chosen === false && (
        <ChoosePseudoModal suggestion={profile.display_name} />
      )}

      {/* Tutoriel « premiers pas » (spotlight) — nouveaux comptes uniquement. */}
      <TourSpotlight />

      {/* Popups de tuto au déblocage d'une activité (par-dessus tout). */}
      <UnlockTutorials />

      {/* Chat (général / guilde / privé) en bas à droite. */}
      <ChatWidget />

      {/* Panneau admin (rendu seulement pour l'id admin) en bas à gauche. */}
      <AdminPanel />

      {/* Rubriques du header : récompense journalière + classement global. */}
      {panel === 'daily' && <DailyRewardModal onClose={() => setPanel(null)} />}
      {panel === 'leaderboard' && <LeaderboardModal onClose={() => setPanel(null)} />}
      {panel === 'redeem' && <RedeemModal onClose={() => setPanel(null)} />}
      {panel === 'changelog' && <ChangelogModal onClose={() => setPanel(null)} />}

      {/* Écran de retour idle : ce qui t'attend depuis la dernière visite. */}
      {showReturn && (
        <ReturnSummaryModal summary={returnSummary} onClose={() => setShowReturn(false)} />
      )}
    </div>
  );
}

function AccountBadge({
  level,
  title,
  xpInLevel,
  xpForLevel,
  nextUnlock,
}: {
  level: number;
  title: string;
  xpInLevel: number;
  xpForLevel: number;
  nextUnlock: string | null;
}) {
  const pct = Math.min(100, Math.round((xpInLevel / Math.max(1, xpForLevel)) * 100));
  return (
    <span
      className="flex items-center gap-2 rounded-lg border border-[var(--color-arcane)]/30 bg-[var(--color-arcane)]/10 px-3 py-1.5"
      title={`Compte niveau ${level} · ${title} · ${xpInLevel}/${xpForLevel} XP${
        nextUnlock ? ` · Prochain : ${nextUnlock}` : ''
      }`}
    >
      <UiIcon name="xp" size={15} />
      <span className="font-display text-xs font-semibold text-[var(--color-ink)]">
        Nv.{level}
        <span className="ml-1 hidden text-[var(--color-muted)] lg:inline">{title}</span>
      </span>
      <span className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-black/40 lg:block">
        <span
          className="block h-full rounded-full bg-[var(--color-arcane)]"
          style={{ width: `${pct}%` }}
        />
      </span>
    </span>
  );
}

type ItemProps = NavEntry & { locked: boolean; reqLevel: number; badge: boolean };

/** Libellé du cadenas selon le jalon de déblocage. */
function lockLabel(activity: ActivityKey | undefined, reqLevel: number): string {
  if (activity === 'inventory') return 'Débloqué en ramassant ton premier matériau';
  if (activity === 'village' || activity === 'tavern') return 'Débloqué à ta première défaite';
  return `Débloqué au niveau de compte ${reqLevel}`;
}

function SidebarItem({ to, label, glyph, end, locked, reqLevel, activity, badge, tour }: ItemProps) {
  if (locked) {
    return (
      <div
        data-tour={tour}
        title={lockLabel(activity, reqLevel)}
        className="group relative flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--color-muted)]/40 max-sm:justify-center lg:justify-start"
      >
        <SyntyGlyph src={glyph} size={22} color="currentColor" />
        <span className="hidden lg:inline">{label}</span>
        <span className="ml-auto hidden lg:inline">
          <UiIcon name="lock" size={13} color="currentColor" />
        </span>
      </div>
    );
  }
  return (
    <NavLink
      to={to}
      end={end ?? false}
      title={label}
      data-tour={tour}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
          isActive
            ? 'bg-[var(--color-arcane)]/15 text-[var(--color-ink)]'
            : 'text-[var(--color-muted)] hover:bg-white/5 hover:text-[var(--color-ink)]'
        } max-sm:justify-center lg:justify-start`
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={`absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-[var(--color-arcane)] transition ${
              isActive ? 'opacity-100' : 'opacity-0'
            }`}
          />
          <span className="relative">
            <SyntyGlyph
              src={glyph}
              size={22}
              color={isActive ? 'var(--color-arcane)' : 'currentColor'}
            />
            <NotifDot show={badge} className="-right-1 -top-1" title="Action disponible" />
          </span>
          <span className="hidden lg:inline">{label}</span>
        </>
      )}
    </NavLink>
  );
}

function BottomItem({ to, label, glyph, end, locked, reqLevel, activity, badge, tour }: ItemProps) {
  if (locked) {
    return (
      <div
        data-tour={tour}
        title={lockLabel(activity, reqLevel)}
        className="relative flex flex-1 flex-col items-center justify-center gap-1 py-3 text-[11px] font-medium text-[var(--color-muted)]/40"
      >
        <SyntyGlyph src={glyph} size={26} color="currentColor" />
        {label}
        <span className="absolute right-2 top-1.5">
          <UiIcon name="lock" size={10} color="currentColor" />
        </span>
      </div>
    );
  }
  return (
    <NavLink
      to={to}
      end={end ?? false}
      data-tour={tour}
      className={({ isActive }) =>
        `flex flex-1 flex-col items-center justify-center gap-1 py-3 text-[11px] font-medium transition ${
          isActive
            ? 'bg-[var(--color-arcane)]/10 text-[var(--color-ink)]'
            : 'text-[var(--color-muted)]'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span className="relative">
            <SyntyGlyph
              src={glyph}
              size={26}
              color={isActive ? 'var(--color-arcane)' : 'currentColor'}
            />
            <NotifDot show={badge} className="-right-1.5 -top-1" title="Action disponible" />
          </span>
          {label}
        </>
      )}
    </NavLink>
  );
}
