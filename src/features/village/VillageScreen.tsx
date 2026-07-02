import { Link } from 'react-router-dom';
import { useResources, resourceMeta } from '@/hooks/useResources';
import { useProfile } from '@/hooks/useProfile';

type Rubric = {
  to: string;
  icon: string;
  title: string;
  desc: string;
  accent: string;
};

const RUBRICS: Rubric[] = [
  { to: '/', icon: '🗺️', title: 'Carte du monde', desc: 'Déploie tes héros et progresse dans les zones.', accent: '#22c55e' },
  { to: '/tavern', icon: '🍺', title: 'Taverne', desc: 'Recrute les aventuriers du jour (renouvelés à minuit).', accent: '#e8b64a' },
  { to: '/squad', icon: '⚔️', title: 'Escouade', desc: 'Gère tes héros, leurs stats et leur équipement.', accent: '#8b7cf6' },
  { to: '/forge', icon: '⚒️', title: 'Forge', desc: 'Fabrique armes et armures, puis renforce-les.', accent: '#f0934a' },
  { to: '/jewelry', icon: '💍', title: 'Joaillerie', desc: 'Sertis des bijoux à passifs, puis raffine-les.', accent: '#60a5fa' },
  { to: '/inventory', icon: '🎒', title: 'Sac', desc: 'Ton butin, tes matériaux et tes gemmes.', accent: '#5fd39b' },
  { to: '/leaderboard', icon: '🏆', title: 'Classement', desc: 'Compare ta puissance aux autres commandants.', accent: '#eab308' },
];

export function VillageScreen() {
  const { data: resources } = useResources();
  const { data: profile } = useProfile();

  const entries = [
    { key: 'gold', label: 'Or', icon: '💰', amount: profile?.gold ?? 0 },
    ...Object.entries(resources ?? {})
      .filter(([, amt]) => amt > 0)
      .map(([key, amt]) => ({
        key,
        label: resourceMeta(key).label,
        icon: resourceMeta(key).icon,
        amount: amt,
      })),
  ];

  return (
    <section className="anim-fade space-y-6">
      <div>
        <h2 className="heading text-2xl">🏰 Village</h2>
        <p className="text-sm text-[var(--color-muted)]">
          Ton camp de base : accède à tout depuis ici.
        </p>
      </div>

      {/* Ressources */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {entries.map((e) => (
          <div key={e.key} className="panel flex flex-col items-center gap-0.5 p-3 text-center">
            <span className="text-xl">{e.icon}</span>
            <span className="font-display text-lg font-bold tabular-nums text-[var(--color-ink)]">
              {e.amount}
            </span>
            <span className="text-[9px] uppercase tracking-widest text-[var(--color-muted)]">
              {e.label}
            </span>
          </div>
        ))}
      </div>

      {/* Rubriques */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {RUBRICS.map((r) => (
          <Link
            key={r.to}
            to={r.to}
            className="panel panel-hover relative overflow-hidden p-5"
            style={{ background: `linear-gradient(120deg, ${r.accent}14 0%, transparent 55%)` }}
          >
            <span className="chip absolute right-3 top-3 bg-white/5 text-[var(--color-muted)]">
              Ouvrir →
            </span>
            <div className="mb-2 text-3xl">{r.icon}</div>
            <h3 className="font-display font-semibold text-[var(--color-ink)]">{r.title}</h3>
            <p className="mt-1 text-sm text-[var(--color-muted)]">{r.desc}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
