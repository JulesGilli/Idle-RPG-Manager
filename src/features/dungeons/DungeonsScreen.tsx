import { useState } from 'react';
import { useHeroes } from '@/features/heroes/useHeroes';
import { useDungeons, type DungeonView } from './useDungeons';
import { useResolveDungeonRun, type ResolveRunResponse } from './useResolveDungeonRun';
import { CombatLogOverlay } from './CombatLogOverlay';

const TEAM_SIZE = 2;

const CLASS_ICON: Record<string, string> = { tank: '🛡️', dps: '⚔️', healer: '✚' };

export function DungeonsScreen() {
  const { data: dungeons, isLoading: dungeonsLoading } = useDungeons();
  const { data: heroes, isLoading: heroesLoading } = useHeroes();
  const resolveRun = useResolveDungeonRun();

  const [selectedDungeon, setSelectedDungeon] = useState<string | null>(null);
  const [selectedHeroes, setSelectedHeroes] = useState<string[]>([]);
  const [run, setRun] = useState<ResolveRunResponse | null>(null);

  function toggleHero(id: string) {
    setSelectedHeroes((prev) => {
      if (prev.includes(id)) return prev.filter((h) => h !== id);
      if (prev.length >= TEAM_SIZE) return prev;
      return [...prev, id];
    });
  }

  const canLaunch =
    selectedDungeon !== null && selectedHeroes.length === TEAM_SIZE && !resolveRun.isPending;

  function launch() {
    if (!canLaunch || selectedDungeon === null) return;
    resolveRun.mutate(
      { dungeonId: selectedDungeon, heroIds: selectedHeroes },
      { onSuccess: (data) => setRun(data) },
    );
  }

  return (
    <section>
      <h2 className="text-xl font-semibold">Donjons</h2>

      {/* Sélection d'équipe */}
      <div className="mt-4">
        <h3 className="text-sm font-medium text-neutral-400">
          Équipe ({selectedHeroes.length}/{TEAM_SIZE})
        </h3>
        {heroesLoading && <p className="mt-2 text-neutral-500">Chargement des héros…</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          {(heroes ?? []).map((hero) => {
            const active = selectedHeroes.includes(hero.id);
            return (
              <button
                key={hero.id}
                onClick={() => toggleHero(hero.id)}
                className={`rounded-lg border px-3 py-2 text-sm transition ${
                  active
                    ? 'border-indigo-500 bg-indigo-950 text-white'
                    : 'border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-neutral-500'
                }`}
              >
                <span className="mr-1">{CLASS_ICON[hero.classId] ?? '❓'}</span>
                {hero.name}
                <span className="ml-2 text-xs text-neutral-500">Niv.{hero.level}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Liste des donjons */}
      <div className="mt-6 space-y-3">
        {dungeonsLoading && <p className="text-neutral-500">Chargement des donjons…</p>}
        {(dungeons ?? []).map((dungeon) => (
          <DungeonRow
            key={dungeon.id}
            dungeon={dungeon}
            selected={selectedDungeon === dungeon.id}
            onSelect={() => setSelectedDungeon(dungeon.id)}
          />
        ))}
      </div>

      {/* Lancement */}
      <div className="mt-6">
        <button
          onClick={launch}
          disabled={!canLaunch}
          className="rounded-lg bg-emerald-600 px-6 py-3 font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {resolveRun.isPending ? 'Combat en cours…' : 'Lancer le donjon'}
        </button>
        {!canLaunch && !resolveRun.isPending && (
          <p className="mt-2 text-xs text-neutral-500">
            Sélectionne un donjon et exactement {TEAM_SIZE} héros.
          </p>
        )}
        {resolveRun.isError && (
          <p className="mt-2 text-sm text-red-400">
            Erreur : {resolveRun.error instanceof Error ? resolveRun.error.message : 'inconnue'}
          </p>
        )}
      </div>

      {run && <CombatLogOverlay run={run} onClose={() => setRun(null)} />}
    </section>
  );
}

function DungeonRow({
  dungeon,
  selected,
  onSelect,
}: {
  dungeon: DungeonView;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
        selected
          ? 'border-indigo-500 bg-indigo-950/40'
          : 'border-neutral-800 bg-neutral-950 hover:border-neutral-600'
      }`}
    >
      <div>
        <div className="font-medium text-neutral-100">{dungeon.name}</div>
        <div className="mt-0.5 text-xs text-neutral-500">
          {dungeon.enemies.length} ennemi(s) : {dungeon.enemies.map((e) => e.name).join(', ')}
        </div>
      </div>
      <div className="shrink-0 text-amber-300" title={`Difficulté ${dungeon.difficulty}`}>
        {'★'.repeat(dungeon.difficulty)}
        <span className="text-neutral-700">{'★'.repeat(Math.max(0, 4 - dungeon.difficulty))}</span>
      </div>
    </button>
  );
}
