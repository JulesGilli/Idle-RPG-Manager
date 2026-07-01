import { useState } from 'react';
import { useHeroes } from '@/features/heroes/useHeroes';
import { classMeta, stars } from '@/lib/gameUi';
import { useDungeons, type DungeonView } from './useDungeons';
import { useResolveDungeonRun, type ResolveRunResponse } from './useResolveDungeonRun';
import { CombatLogOverlay } from './CombatLogOverlay';

const TEAM_SIZE = 2;

const DANGER: Record<number, { label: string; color: string }> = {
  1: { label: 'Facile', color: '#5fd39b' },
  2: { label: 'Modéré', color: '#e8b64a' },
  3: { label: 'Difficile', color: '#f0934a' },
  4: { label: 'Mortel', color: '#f06b4a' },
};

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
    <section className="anim-fade space-y-6">
      <div>
        <h2 className="heading text-2xl">Donjons</h2>
        <p className="text-sm text-[var(--color-muted)]">
          Compose une équipe de {TEAM_SIZE} et affronte les profondeurs.
        </p>
      </div>

      {/* Sélection d'équipe */}
      <div className="panel p-4">
        <h3 className="mb-3 text-sm font-semibold text-[var(--color-muted)]">
          Équipe · {selectedHeroes.length}/{TEAM_SIZE}
        </h3>
        {heroesLoading && <p className="text-[var(--color-muted)]">Chargement…</p>}
        <div className="flex flex-wrap gap-2">
          {(heroes ?? []).map((hero) => {
            const meta = classMeta(hero.classId);
            const active = selectedHeroes.includes(hero.id);
            return (
              <button
                key={hero.id}
                onClick={() => toggleHero(hero.id)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                  active
                    ? 'border-[var(--color-arcane)] bg-[var(--color-arcane)]/15 text-white'
                    : 'border-[var(--color-edge)] bg-black/20 text-[var(--color-muted)] hover:border-white/25 hover:text-neutral-200'
                }`}
              >
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-full text-sm"
                  style={{ boxShadow: `inset 0 0 0 1px ${meta.accent}66` }}
                >
                  {meta.icon}
                </span>
                <span className="font-medium">{hero.name}</span>
                <span className="text-[10px] text-[var(--color-muted)]">N.{hero.level}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Donjons */}
      <div className="grid gap-3 sm:grid-cols-2">
        {dungeonsLoading && <p className="text-[var(--color-muted)]">Chargement des donjons…</p>}
        {(dungeons ?? []).map((dungeon) => (
          <DungeonCard
            key={dungeon.id}
            dungeon={dungeon}
            selected={selectedDungeon === dungeon.id}
            onSelect={() => setSelectedDungeon(dungeon.id)}
          />
        ))}
      </div>

      {/* Lancement */}
      <div className="sticky bottom-4 z-20">
        <div className="panel flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="text-sm text-[var(--color-muted)]">
            {canLaunch ? 'Prêt au combat.' : `Choisis un donjon et ${TEAM_SIZE} héros pour partir.`}
            {resolveRun.isError && (
              <span className="ml-2 text-[var(--color-ember)]">
                {resolveRun.error instanceof Error ? resolveRun.error.message : 'Erreur'}
              </span>
            )}
          </div>
          <button onClick={launch} disabled={!canLaunch} className="btn btn-primary">
            {resolveRun.isPending ? '⚔️ Combat…' : '⚔️ Lancer le donjon'}
          </button>
        </div>
      </div>

      {run && <CombatLogOverlay run={run} onClose={() => setRun(null)} />}
    </section>
  );
}

function DungeonCard({
  dungeon,
  selected,
  onSelect,
}: {
  dungeon: DungeonView;
  selected: boolean;
  onSelect: () => void;
}) {
  const danger = DANGER[dungeon.difficulty] ?? DANGER[4]!;
  const s = stars(dungeon.difficulty);

  return (
    <button
      onClick={onSelect}
      className={`panel panel-hover anim-slide relative overflow-hidden p-4 text-left ${
        selected ? 'ring-2 ring-[var(--color-arcane)]' : ''
      }`}
    >
      <div
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ background: `linear-gradient(90deg, transparent, ${danger.color}, transparent)` }}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold text-[var(--color-ink)]">
            {dungeon.name}
          </h3>
          <div className="mt-0.5 text-xs" style={{ color: danger.color }}>
            {danger.label}
          </div>
        </div>
        <div className="shrink-0 text-sm" style={{ color: danger.color }}>
          {'★'.repeat(s.full)}
          <span className="text-[var(--color-edge)]">{'★'.repeat(s.empty)}</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {dungeon.enemies.map((e, i) => (
          <span
            key={i}
            className="rounded-md border border-[var(--color-edge)] bg-black/30 px-2 py-0.5 text-[11px] text-[var(--color-muted)]"
          >
            {e.name}
          </span>
        ))}
      </div>
    </button>
  );
}
