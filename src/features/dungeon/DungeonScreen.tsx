import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useHeroes, type HeroView } from '@/features/heroes/useHeroes';
import { classMeta } from '@/lib/gameUi';
import { classWeaponCleanUrl, MAP_ART } from '@/lib/synty';
import { SyntyGlyph, SyntyImg } from '@/components/synty/SyntyIcon';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { CombatReplay, type StoredCombat } from '@/components/CombatReplay';
import { resourceMeta } from '@/hooks/useResources';
import {
  useDungeonTypes,
  useRunDungeon,
  type DungeonTypeRow,
  type DungeonCombat,
  type DungeonRunResponse,
} from './useDungeon';

const MAX_TEAM = 5;

const KIND_META: Record<'normal' | 'miniboss' | 'boss', { label: string; art?: string; emoji: string }> = {
  normal: { label: 'Monstre', emoji: '⚔️' },
  miniboss: { label: 'Mini-boss', art: MAP_ART.skull, emoji: '💀' },
  boss: { label: 'Boss', art: MAP_ART.dragon, emoji: '🐉' },
};

/** Le combat donjon (camelCase) → forme attendue par CombatReplay. */
function toStored(c: DungeonCombat): StoredCombat {
  return { rounds: c.rounds, result: c.result, events: c.events, final_state: c.finalState };
}

/** Ressources uniques d'une (ou plusieurs) table(s) de loot, pour l'aperçu. */
function lootResources(dj: DungeonTypeRow): string[] {
  const keys = [dj.loot_table_normal, dj.loot_table_miniboss, dj.loot_table_boss]
    .flat()
    .map((e) => e.resource);
  return [...new Set(keys)];
}

export function DungeonScreen() {
  const { data: heroes } = useHeroes();
  const { data: dungeons, isLoading } = useDungeonTypes();
  const run = useRunDungeon();

  const [dungeonId, setDungeonId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<{ res: DungeonRunResponse; total: number } | null>(null);
  const [replayIdx, setReplayIdx] = useState<number | null>(null);
  /** L'issue + le butin ne se dévoilent qu'une fois les combats regardés jusqu'au bout. */
  const [revealed, setRevealed] = useState(false);

  const team = heroes ?? [];
  const selectedDungeon = (dungeons ?? []).find((d) => d.id === dungeonId) ?? null;

  function toggleHero(id: string) {
    setPicked((cur) =>
      cur.includes(id) ? cur.filter((h) => h !== id) : cur.length < MAX_TEAM ? [...cur, id] : cur,
    );
  }

  function launch() {
    if (!selectedDungeon || picked.length === 0) return;
    setResult(null);
    setReplayIdx(null);
    setRevealed(false);
    run.mutate(
      { dungeonTypeId: selectedDungeon.id, heroIds: picked },
      {
        onSuccess: (res) => {
          // On enchaîne directement sur le 1er combat — l'issue reste cachée.
          setResult({ res, total: selectedDungeon.monster_sequence.length });
          setRevealed(false);
          setReplayIdx(0);
        },
      },
    );
  }

  const canLaunch = Boolean(selectedDungeon) && picked.length > 0 && !run.isPending;

  return (
    <section className="anim-fade space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="heading flex items-center gap-2 text-2xl">
            <SyntyImg src={MAP_ART.skull} size={26} />
            Donjons
          </h2>
          <p className="text-sm text-[var(--color-muted)]">
            Un test d'endurance : ton équipe n'a <strong>aucun répit</strong> — ses PV ne se
            régénèrent pas entre les vagues. Tenez jusqu'au boss… ou c'est le wipe.
          </p>
        </div>
        <Link to="/village" className="btn btn-ghost text-xs">
          ← Village
        </Link>
      </div>

      {/* Choix du donjon */}
      {isLoading && <p className="text-[var(--color-muted)]">Chargement des donjons…</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {(dungeons ?? []).map((dj) => {
          const active = dungeonId === dj.id;
          return (
            <button
              key={dj.id}
              onClick={() => setDungeonId(dj.id)}
              className={`panel p-4 text-left transition ${
                active ? 'ring-2 ring-[var(--color-arcane)]' : 'hover:border-white/25'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-display font-semibold text-[var(--color-ink)]">{dj.name}</span>
                <span className="chip bg-white/5 text-[10px] text-[var(--color-muted)]">
                  Tier {dj.tier}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-[var(--color-muted)]">
                <span>⚔️ {dj.monster_sequence.length} vagues</span>
                <span>💀 {dj.miniboss_indices.length} mini-boss</span>
                <span>🐉 boss</span>
                {Number(dj.regen_pct_between_fights) > 0 ? (
                  <span>❤️ +{Math.round(Number(dj.regen_pct_between_fights) * 100)}% / combat</span>
                ) : (
                  <span className="text-[var(--color-ember)]">🩸 sans répit</span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-ink)]/80">
                <span className="text-[var(--color-muted)]">Butin :</span>
                {lootResources(dj).map((r) => (
                  <span key={r} className="inline-flex items-center gap-1">
                    <ResourceIcon resKey={r} /> {resourceMeta(r).label}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {/* Sélection de l'équipe */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--color-muted)]">
            Ton escouade · {picked.length}/{MAX_TEAM}
          </h3>
          {picked.length > 0 && (
            <button
              onClick={() => setPicked([])}
              className="text-xs text-[var(--color-muted)] hover:text-[var(--color-ink)]"
            >
              Tout retirer
            </button>
          )}
        </div>
        {team.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">
            Aucun héros — recrute à la Taverne d'abord.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {team.map((h) => (
              <HeroPick
                key={h.id}
                hero={h}
                selected={picked.includes(h.id)}
                onToggle={() => toggleHero(h.id)}
              />
            ))}
          </div>
        )}
      </div>

      {run.isError && (
        <p className="text-sm text-[var(--color-ember)]">
          {run.error instanceof Error ? run.error.message : 'Erreur'}
        </p>
      )}

      <button onClick={launch} disabled={!canLaunch} className="btn btn-primary w-full text-sm">
        {run.isPending
          ? 'Exploration…'
          : selectedDungeon
            ? `🗝️ Lancer : ${selectedDungeon.name}`
            : 'Choisis un donjon'}
      </button>

      {/* Résultat — dévoilé seulement une fois les combats regardés */}
      {result && revealed && replayIdx === null && (
        <RunResult run={result.res} total={result.total} onReplay={() => setReplayIdx(0)} />
      )}

      {/* Combats joués un par un (le joueur lance le suivant) */}
      {result && replayIdx !== null && result.res.fight_results[replayIdx] && (
        <DungeonReplay
          fights={result.res.fight_results}
          index={replayIdx}
          onIndex={setReplayIdx}
          onClose={() => {
            setReplayIdx(null);
            setRevealed(true);
          }}
        />
      )}
    </section>
  );
}

function HeroPick({
  hero,
  selected,
  onToggle,
}: {
  hero: HeroView;
  selected: boolean;
  onToggle: () => void;
}) {
  const meta = classMeta(hero.classId);
  return (
    <button
      onClick={onToggle}
      className={`panel flex flex-col items-center gap-1 p-2.5 text-center transition ${
        selected ? 'ring-2 ring-[var(--color-arcane)]' : 'opacity-80 hover:opacity-100'
      }`}
    >
      <SyntyGlyph src={classWeaponCleanUrl(hero.classId)} color={meta.accent} size={30} />
      <span className="w-full truncate text-xs font-medium text-[var(--color-ink)]">
        {hero.name}
      </span>
      <span className="text-[9px] text-[var(--color-muted)]">
        {hero.className} · N.{hero.level}
      </span>
      <span className="text-[10px] font-semibold text-[var(--color-gold)]">⚡ {hero.power}</span>
    </button>
  );
}

function RunResult({
  run,
  total,
  onReplay,
}: {
  run: DungeonRunResponse;
  total: number;
  onReplay: () => void;
}) {
  const reached = run.reached_index + 1;
  return (
    <div className="panel anim-pop space-y-3 p-4">
      <div className="flex items-center justify-between">
        <span
          className={`font-display text-lg font-bold ${
            run.success ? 'text-[var(--color-gold)]' : 'text-[var(--color-ember)]'
          }`}
        >
          {run.success ? '🏆 Donjon conquis !' : '☠ Wipe'}
        </span>
        <span className="chip bg-white/5 text-[11px] text-[var(--color-muted)]">
          Combat {reached}/{total}
        </span>
      </div>

      <div>
        <div className="mb-1 text-xs text-[var(--color-muted)]">Butin récupéré</div>
        {run.loot.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]/70">Aucun butin.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {run.loot.map((d) => (
              <span
                key={d.resource}
                className="chip inline-flex items-center gap-1 bg-white/5 text-[var(--color-ink)]"
              >
                <ResourceIcon resKey={d.resource} /> +{d.amount} {resourceMeta(d.resource).label}
              </span>
            ))}
          </div>
        )}
      </div>

      <button onClick={onReplay} className="btn btn-arcane w-full text-sm">
        ▶ Revoir les combats ({run.fight_results.length})
      </button>
    </div>
  );
}

function DungeonReplay({
  fights,
  index,
  onIndex,
  onClose,
}: {
  fights: DungeonRunResponse['fight_results'];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const fight = fights[index]!;
  const kind = KIND_META[fight.kind];
  const hasPrev = index > 0;
  const hasNext = index < fights.length - 1;
  // Un combat perdu = wipe (l'équipe est tombée) → on ne « lance » pas la suite.
  const lost = fight.combat.result === 'loss';

  return (
    <CombatReplay
      key={index}
      combat={toStored(fight.combat)}
      onClose={onClose}
      title={`Combat ${index + 1}/${fights.length} — ${kind.emoji} ${fight.enemyName}`}
      footer={
        <div className="mt-3 flex items-center justify-center gap-2">
          <button
            onClick={() => hasPrev && onIndex(index - 1)}
            disabled={!hasPrev}
            className="btn btn-ghost text-xs disabled:opacity-40"
          >
            ◀ Précédent
          </button>
          {hasNext && !lost ? (
            <button onClick={() => onIndex(index + 1)} className="btn btn-primary text-xs">
              ⚔️ Lancer le combat suivant
            </button>
          ) : (
            <button onClick={onClose} className="btn btn-primary text-xs">
              {lost ? '☠ Voir le bilan' : '🏆 Voir le butin'}
            </button>
          )}
        </div>
      }
    />
  );
}
