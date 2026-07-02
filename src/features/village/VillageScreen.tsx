import { Link } from 'react-router-dom';

type Rubric = {
  to: string;
  icon: string;
  title: string;
  desc: string;
  accent: string;
};

// Le village est un hub RP : uniquement les artisans et marchands. La carte,
// l'escouade et le sac restent accessibles via la barre de navigation.
const RUBRICS: Rubric[] = [
  { to: '/tavern', icon: '🍺', title: 'Taverne', desc: 'Recrute les aventuriers du jour (renouvelés à minuit).', accent: '#e8b64a' },
  { to: '/forge', icon: '⚒️', title: 'Forge', desc: 'Le forgeron fabrique armes et armures, puis les renforce.', accent: '#f0934a' },
  { to: '/jewelry', icon: '💍', title: 'Joaillerie', desc: 'Le joaillier sertit des bijoux à passifs, puis les raffine.', accent: '#60a5fa' },
  { to: '/library', icon: '📚', title: 'Bibliothèque du Savoir', desc: 'Dépense les points de compétence de tes héros dans leur arbre.', accent: '#8b7cf6' },
];

export function VillageScreen() {
  return (
    <section className="anim-fade space-y-6">
      <div>
        <h2 className="heading text-2xl">🏰 Village</h2>
        <p className="text-sm text-[var(--color-muted)]">
          Les artisans et marchands du village. Rends-leur visite pour équiper et former tes héros.
        </p>
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
