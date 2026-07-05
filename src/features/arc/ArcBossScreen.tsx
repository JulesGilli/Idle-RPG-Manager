import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useHeroes } from '@/features/heroes/useHeroes';
import {
  useHeroAvailability,
  heroIsBusy,
  HERO_STATUS_LABEL,
} from '@/features/heroes/useHeroAvailability';
import { useLevelProgress } from '@/features/maps/useMaps';
import { classMeta } from '@/lib/gameUi';
import { classWeaponCleanUrl, MAP_ART } from '@/lib/synty';
import { SyntyGlyph, SyntyImg } from '@/components/synty/SyntyIcon';
import { UiIcon } from '@/components/synty/GameIcons';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { resourceMeta } from '@/hooks/useResources';
import { CombatReplay, type StoredCombat } from '@/components/CombatReplay';
import type { DungeonCombat } from '@/features/dungeon/useDungeon';
import {
  useArcBosses,
  useArcProgress,
  useResolveArcBoss,
  type ArcBossRow,
  type ArcBossRunResponse,
} from './useArcBoss';

const MAX_TEAM = 5;

function toStored(c: DungeonCombat): StoredCombat {
  return { rounds: c.rounds, result: c.result, events: c.events, final_state: c.finalState };
}

export function ArcBossScreen() {
  const { data: bosses, isLoading } = useArcBosses();
  const { data: cleared } = useArcProgress();
  const { data: levelsDone } = useLevelProgress();
  const { data: heroes } = useHeroes();
  const availability = useHeroAvailability();
  const resolve = useResolveArcBoss();

  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<ArcBossRunResponse | null>(null);
  const [replayIdx, setReplayIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const heroList = heroes ?? [];
  const clearedSet = cleared ?? new Set<string>();
  const doneSet = levelsDone ?? new Set<string>();

  // Le boss d'arc « courant » : le premier non encore vaincu.
  const boss = (bosses ?? []).find((b) => !clearedSet.has(b.id)) ?? (bosses ?? [])[0] ?? null;
  const isCleared = boss ? clearedSet.has(boss.id) : false;
  const isReady = boss?.required_level_id ? doneSet.has(boss.required_level_id) : true;

  function toggleHero(id: string) {
    if (heroIsBusy(availability.get(id))) return;
    setPicked((cur) =>
      cur.includes(id) ? cur.filter((h) => h !== id) : cur.length < MAX_TEAM ? [...cur, id] : cur,
    );
  }

  function launch() {
    if (!boss || picked.length === 0) return;
    setError(null);
    setResult(null);
    setReplayIdx(null);
    resolve.mutate(
      { arcBossId: boss.id, heroIds: picked },
      {
        onSuccess: (r) => {
          setResult(r);
          setReplayIdx(0);
        },
        onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
      },
    );
  }

  const canLaunch = Boolean(boss) && !isCleared && isReady && picked.length > 0 && !resolve.isPending;

  return (
    <section className="anim-fade space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="heading flex items-center gap-2 text-2xl">
            <SyntyImg src={MAP_ART.dragon} size={26} />
            Boss d'arc
          </h2>
          <p className="text-sm text-[var(--color-muted)]">
            La rencontre qui clôt un arc. Terrasse-le pour <strong>débloquer l'arc suivant</strong> et
            son <strong>tier de matériaux</strong> de craft.
          </p>
        </div>
        <Link to="/" className="btn btn-ghost text-xs">
          ← Carte
        </Link>
      </div>

      {isLoading && <p className="text-[var(--color-muted)]">Chargement…</p>}
      {!isLoading && !boss && (
        <p className="text-sm text-[var(--color-muted)]">Aucun boss d'arc pour l'instant.</p>
      )}

      {boss && (
        <ArcBossCard boss={boss} cleared={isCleared} ready={isReady} />
      )}

      {boss && !isCleared && (
        <>
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
            {heroList.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">Aucun héros — recrute à la Taverne.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {heroList.map((h) => {
                  const busy = heroIsBusy(availability.get(h.id));
                  const chosen = picked.includes(h.id);
                  const meta = classMeta(h.classId);
                  return (
                    <button
                      key={h.id}
                      onClick={() => toggleHero(h.id)}
                      disabled={busy}
                      title={busy ? `${h.name} — ${HERO_STATUS_LABEL[availability.get(h.id)!]}` : h.name}
                      className={`panel flex flex-col items-center gap-1 p-2.5 text-center transition ${
                        busy
                          ? 'cursor-not-allowed opacity-40'
                          : chosen
                            ? 'ring-2 ring-[var(--color-arcane)]'
                            : 'opacity-80 hover:opacity-100'
                      }`}
                    >
                      <SyntyGlyph src={classWeaponCleanUrl(h.classId)} color={meta.accent} size={30} />
                      <span className="w-full truncate text-xs font-medium text-[var(--color-ink)]">
                        {h.name}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--color-gold)]">
                        <UiIcon name="power" size={11} /> {h.power}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {(error || resolve.isError) && (
            <p className="text-sm text-[var(--color-ember)]">
              {error ?? (resolve.error instanceof Error ? resolve.error.message : 'Erreur')}
            </p>
          )}

          <button onClick={launch} disabled={!canLaunch} className="btn btn-primary w-full text-sm">
            {resolve.isPending
              ? 'Affrontement…'
              : !isReady
                ? "Termine d'abord les zones de l'arc"
                : `Défier : ${boss.name}`}
          </button>
        </>
      )}

      {/* Résultat + replay */}
      {result && replayIdx !== null && result.fight_results[replayIdx] && (
        <ArcReplay
          fights={result.fight_results}
          index={replayIdx}
          bossName={boss?.name ?? 'Boss'}
          onIndex={setReplayIdx}
          onClose={() => setReplayIdx(null)}
        />
      )}
      {result && replayIdx === null && <ArcResult run={result} onReplay={() => setReplayIdx(0)} />}
    </section>
  );
}

function ArcBossCard({ boss, cleared, ready }: { boss: ArcBossRow; cleared: boolean; ready: boolean }) {
  const waves = boss.monster_sequence?.length ?? 0;
  return (
    <div className="panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-display text-lg font-bold text-[var(--color-ink)]">
          <UiIcon name="dragon" size={20} color="var(--color-gold-soft)" /> {boss.name}
        </span>
        {cleared ? (
          <span className="chip inline-flex items-center gap-1 bg-emerald-500/15 text-[11px] text-emerald-300">
            <UiIcon name="victory" size={12} /> Vaincu
          </span>
        ) : ready ? (
          <span className="chip bg-[var(--color-gold)]/15 text-[11px] text-[var(--color-gold-soft)]">
            Prêt à défier
          </span>
        ) : (
          <span className="chip inline-flex items-center gap-1 bg-white/5 text-[11px] text-[var(--color-muted)]">
            <UiIcon name="lock" size={11} /> Termine l'arc
          </span>
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-3 text-xs text-[var(--color-muted)]">
        <span>{waves} combat(s)</span>
        <span className="text-[var(--color-gold-soft)]">Débloque le tier de matériaux {boss.unlocks_tier}</span>
      </div>
    </div>
  );
}

function ArcResult({ run, onReplay }: { run: ArcBossRunResponse; onReplay: () => void }) {
  return (
    <div className="panel anim-pop space-y-3 p-4">
      <span
        className={`flex items-center gap-1.5 font-display text-lg font-bold ${
          run.success ? 'text-[var(--color-gold)]' : 'text-[var(--color-ember)]'
        }`}
      >
        <UiIcon name={run.success ? 'victory' : 'defeat'} size={20} color="currentColor" />
        {run.success ? `${run.arc_boss.name} vaincu — tier ${run.arc_boss.unlocks_tier} débloqué !` : 'Échec'}
      </span>
      {run.loot.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {run.loot.map((d) => (
            <span key={d.resource} className="chip inline-flex items-center gap-1 bg-white/5 text-[var(--color-ink)]">
              <ResourceIcon resKey={d.resource} /> +{d.amount} {resourceMeta(d.resource).label}
            </span>
          ))}
        </div>
      )}
      <button onClick={onReplay} className="btn btn-arcane w-full text-sm">
        ▶ Revoir les combats ({run.fight_results.length})
      </button>
    </div>
  );
}

function ArcReplay({
  fights,
  index,
  bossName,
  onIndex,
  onClose,
}: {
  fights: ArcBossRunResponse['fight_results'];
  index: number;
  bossName: string;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const fight = fights[index]!;
  const hasNext = index < fights.length - 1;
  const lost = fight.combat.result === 'loss';
  return (
    <CombatReplay
      key={index}
      combat={toStored(fight.combat)}
      onClose={onClose}
      title={`${bossName} — combat ${index + 1}/${fights.length} : ${fight.enemyName}`}
      footer={
        <div className="mt-3 flex items-center justify-center gap-2">
          <button
            onClick={() => index > 0 && onIndex(index - 1)}
            disabled={index === 0}
            className="btn btn-ghost text-xs disabled:opacity-40"
          >
            ◀ Précédent
          </button>
          {hasNext && !lost ? (
            <button onClick={() => onIndex(index + 1)} className="btn btn-primary text-xs">
              Combat suivant ▶
            </button>
          ) : (
            <button onClick={onClose} className="btn btn-primary text-xs">
              Voir le bilan
            </button>
          )}
        </div>
      }
    />
  );
}
