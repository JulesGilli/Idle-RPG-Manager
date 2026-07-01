import { HeroCard } from '@/components/HeroCard';
import { useHeroes } from './useHeroes';

export function SquadScreen() {
  const { data: heroes, isLoading, isError, error } = useHeroes();

  const totalPower = (heroes ?? []).reduce((sum, h) => sum + h.power, 0);

  return (
    <section>
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-semibold">Mon escouade</h2>
        {heroes && heroes.length > 0 && (
          <span className="text-sm text-neutral-400">
            Puissance totale <span className="font-semibold text-amber-300">{totalPower}</span>
          </span>
        )}
      </div>

      {isLoading && <p className="mt-4 text-neutral-500">Chargement des héros…</p>}
      {isError && (
        <p className="mt-4 text-red-400">
          Erreur : {error instanceof Error ? error.message : 'inconnue'}
        </p>
      )}

      {heroes && heroes.length === 0 && (
        <p className="mt-4 text-neutral-500">Aucun héros pour l'instant.</p>
      )}

      {heroes && heroes.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {heroes.map((hero) => (
            <HeroCard key={hero.id} hero={hero} />
          ))}
        </div>
      )}
    </section>
  );
}
