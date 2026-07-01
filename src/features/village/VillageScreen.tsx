import { Link } from 'react-router-dom';
import { useResources, resourceMeta } from '@/hooks/useResources';
import { useProfile } from '@/hooks/useProfile';

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
        <h2 className="heading text-2xl">Village</h2>
        <p className="text-sm text-[var(--color-muted)]">
          Ton camp de base. La forge et les améliorations arrivent bientôt.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {entries.map((e) => (
          <div key={e.key} className="panel flex flex-col items-center gap-1 p-4 text-center">
            <span className="text-2xl">{e.icon}</span>
            <span className="font-display text-xl font-bold text-[var(--color-ink)] tabular-nums">
              {e.amount}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-[var(--color-muted)]">
              {e.label}
            </span>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <ForgeCard
          to="/forge"
          icon="⚒️"
          title="Forge"
          desc="Fabrique des armes et armures à partir de tes matériaux de zone."
        />
        <ForgeCard
          to="/forge"
          icon="✨"
          title="Amélioration"
          desc="Renforce tes équipements (jusqu'à +10), avec auto-amélioration."
        />
      </div>
    </section>
  );
}

function ForgeCard({
  to,
  icon,
  title,
  desc,
}: {
  to: string;
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <Link to={to} className="panel panel-hover relative overflow-hidden p-5">
      <span className="chip absolute right-3 top-3 bg-[var(--color-arcane)]/15 text-[var(--color-arcane)]">
        Ouvrir →
      </span>
      <div className="mb-2 text-3xl">{icon}</div>
      <h3 className="font-display font-semibold text-[var(--color-ink)]">{title}</h3>
      <p className="mt-1 text-sm text-[var(--color-muted)]">{desc}</p>
    </Link>
  );
}
