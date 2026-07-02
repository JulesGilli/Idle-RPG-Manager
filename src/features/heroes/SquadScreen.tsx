import { Link } from 'react-router-dom';
import { HeroCard } from '@/components/HeroCard';
import { useHeroes } from './useHeroes';

export function SquadScreen() {
  const { data: heroes, isLoading, isError, error } = useHeroes();
  const totalPower = (heroes ?? []).reduce((sum, h) => sum + h.power, 0);

  return (
    <section className="anim-fade space-y-6">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h2 className="heading text-2xl">Mon escouade</h2>
          <p className="text-sm text-[var(--color-muted)]">
            Tes héros et leur équipement. Recrute de nouveaux aventuriers à la{' '}
            <Link to="/tavern" className="text-[var(--color-arcane)] hover:underline">
              🍺 Taverne
            </Link>
            .
          </p>
        </div>
        {heroes && heroes.length > 0 && (
          <div className="panel px-4 py-2 text-right">
            <div className="text-[10px] uppercase tracking-widest text-[var(--color-muted)]">
              Puissance totale
            </div>
            <div className="font-display text-xl font-bold text-[var(--color-gold)]">
              {totalPower}
            </div>
          </div>
        )}
      </div>

      {isLoading && <p className="text-[var(--color-muted)]">Invocation des héros…</p>}
      {isError && (
        <p className="text-[var(--color-ember)]">
          Erreur : {error instanceof Error ? error.message : 'inconnue'}
        </p>
      )}

      {heroes && heroes.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {heroes.map((hero) => (
            <HeroCard key={hero.id} hero={hero} />
          ))}
        </div>
      )}
    </section>
  );
}
