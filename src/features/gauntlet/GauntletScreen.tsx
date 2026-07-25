import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FavStar } from '@/components/FavoriteStar';
import { useHeroes } from '@/features/heroes/useHeroes';
import {
  useHeroAvailability,
  heroIsBusy,
  HERO_STATUS_LABEL,
} from '@/features/heroes/useHeroAvailability';
import { classMeta } from '@/lib/gameUi';
import { classWeaponCleanUrl, syntyUrl } from '@/lib/synty';
import { SyntyGlyph } from '@/components/synty/SyntyIcon';
import { UiIcon } from '@/components/synty/GameIcons';
import { BackToActivities } from '@/components/BackToActivities';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { resourceMeta } from '@/hooks/useResources';
import { CombatReplay, type StoredCombat } from '@/components/CombatReplay';
import { ETERNITY_RESOURCE, ETERNITY_PRODUCTION_TIERS } from '@shared/progression/gauntlet';
import {
  useGauntletState,
  useClaimEternity,
  useRunGauntlet,
  type GauntletRunResponse,
  type GauntletWaveResult,
  type GauntletCombat,
} from './useGauntlet';

const ACCENT = '#c084fc';
const MAX_TEAM = 5;
/** Délai avant l'enchaînement auto vers la vague suivante. */
const AUTO_NEXT_MS = 4000;

function toStored(c: GauntletCombat): StoredCombat {
  return { rounds: c.rounds, result: c.result, events: c.events, final_state: c.finalState };
}

/** Prochain palier de rente (pour montrer au joueur ce qu'il vise). */
function nextTier(bestWave: number): { wave: number; perDay: number } | null {
  return ETERNITY_PRODUCTION_TIERS.find((t) => t.wave > bestWave) ?? null;
}

export function GauntletScreen() {
  const { data: heroes } = useHeroes();
  const availability = useHeroAvailability();
  const state = useGauntletState();
  const claim = useClaimEternity();
  const run = useRunGauntlet();

  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<GauntletRunResponse | null>(null);
  const [replayIdx, setReplayIdx] = useState<number | null>(null);
  const [auto, setAuto] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const heroList = heroes ?? [];
  const bestWave = state.data?.best_wave ?? 0;
  const perDay = state.data?.per_day ?? 0;
  const pending = state.data?.pending ?? 0;
  const next = nextTier(bestWave);

  function toggleHero(heroId: string) {
    setResult(null);
    setReplayIdx(null);
    setError(null);
    setPicked((cur) => {
      if (cur.includes(heroId)) return cur.filter((h) => h !== heroId);
      if (cur.length >= MAX_TEAM) return cur;
      return [...cur, heroId];
    });
  }

  function launch() {
    if (picked.length === 0) return;
    setError(null);
    setResult(null);
    setReplayIdx(null);
    run.mutate(picked, {
      onSuccess: (r) => {
        setResult(r);
        if (r.wave_results.length > 0) setReplayIdx(0);
      },
      onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
    });
  }

  const canLaunch = picked.length > 0 && !run.isPending;

  return (
    <section className="anim-fade space-y-5">
      <BackToActivities />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="heading flex items-center gap-2 text-2xl">
            <SyntyGlyph src={syntyUrl.inv('Swords01')} size={26} color={ACCENT} />
            Le Gauntlet
          </h2>
          <p className="max-w-2xl text-sm text-[var(--color-muted)]">
            Ton escouade affronte des <strong>vagues sans fin</strong>, de plus en plus fortes, à PV
            pleins à chaque vague. La course s'arrête à la première défaite. Seule ta{' '}
            <strong>meilleure vague</strong> compte : plus tu vas loin, plus ta{' '}
            <strong>rente quotidienne d'{resourceMeta(ETERNITY_RESOURCE).label}</strong> monte —
            l'unique ressource qui <strong>renforce les armes divines</strong> (100 % de réussite).
          </p>
        </div>
        <Link to="/" className="btn btn-ghost text-xs">
          ← Activités
        </Link>
      </div>

      {/* Rente d'Éclat d'Éternité */}
      <EternityRente
        bestWave={bestWave}
        perDay={perDay}
        pending={pending}
        next={next}
        loading={state.isLoading}
        claiming={claim.isPending}
        onClaim={() =>
          claim.mutate(undefined, {
            onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
          })
        }
      />

      {/* Sélection d'escouade */}
      <div>
        <h3 className="mb-2 flex items-center justify-between text-sm font-semibold text-[var(--color-muted)]">
          <span>Ton escouade</span>
          <span className="tabular-nums" style={{ color: ACCENT }}>
            {picked.length}/{MAX_TEAM}
          </span>
        </h3>
        {heroList.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">
            Aucun héros — recrutes-en à la Taverne.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {heroList.map((h) => {
              const heroBusy = heroIsBusy(availability.get(h.id));
              const busy = heroBusy || run.isPending;
              const chosen = picked.includes(h.id);
              const full = !chosen && picked.length >= MAX_TEAM;
              const meta = classMeta(h.classId);
              return (
                <button
                  key={h.id}
                  onClick={() => toggleHero(h.id)}
                  disabled={busy || full}
                  title={
                    heroBusy
                      ? `${h.name} — ${HERO_STATUS_LABEL[availability.get(h.id)!]}`
                      : full
                        ? 'Escouade complète'
                        : h.name
                  }
                  className={`panel flex flex-col items-center gap-1 p-2.5 text-center transition ${
                    busy || full
                      ? 'cursor-not-allowed opacity-40'
                      : chosen
                        ? 'ring-2'
                        : 'opacity-80 hover:opacity-100'
                  }`}
                  style={chosen ? { boxShadow: `0 0 0 2px ${ACCENT}` } : undefined}
                >
                  <SyntyGlyph src={classWeaponCleanUrl(h.classId)} color={meta.accent} size={30} />
                  <span className="w-full truncate text-xs font-medium text-[var(--color-ink)]">
                    <FavStar on={h.favorite} />
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

      {(error || run.isError) && (
        <p className="text-sm text-[var(--color-ember)]">
          {error ?? (run.error instanceof Error ? run.error.message : 'Erreur')}
        </p>
      )}

      <button onClick={launch} disabled={!canLaunch} className="btn btn-primary w-full text-sm">
        {run.isPending
          ? 'Course en cours…'
          : picked.length === 0
            ? 'Choisis ton escouade'
            : 'Lancer une course'}
      </button>

      {/* Résultat + replay */}
      {result && replayIdx !== null && result.wave_results[replayIdx] && (
        <GauntletReplay
          waves={result.wave_results}
          index={replayIdx}
          onIndex={setReplayIdx}
          onClose={() => setReplayIdx(null)}
          auto={auto}
          onToggleAuto={() => setAuto((v) => !v)}
        />
      )}
      {result && replayIdx === null && (
        <GauntletResult
          run={result}
          onReplay={() => result.wave_results.length > 0 && setReplayIdx(0)}
        />
      )}
    </section>
  );
}

function EternityRente({
  bestWave,
  perDay,
  pending,
  next,
  loading,
  claiming,
  onClaim,
}: {
  bestWave: number;
  perDay: number;
  pending: number;
  next: { wave: number; perDay: number } | null;
  loading: boolean;
  claiming: boolean;
  onClaim: () => void;
}) {
  return (
    <div className="panel space-y-3 p-4">
      <div className="grid grid-cols-3 gap-3 text-center">
        <Stat label="Meilleure vague" value={loading ? '…' : String(bestWave)} color={ACCENT} />
        <Stat
          label={`${resourceMeta(ETERNITY_RESOURCE).label} / jour`}
          value={loading ? '…' : String(perDay)}
          color="var(--color-gold)"
          icon
        />
        <Stat label="En attente" value={loading ? '…' : String(pending)} color="var(--color-gold-soft)" icon />
      </div>

      {next && (
        <p className="text-center text-[11px] text-[var(--color-muted)]">
          Prochain palier : <strong style={{ color: ACCENT }}>vague {next.wave}</strong> →{' '}
          <strong className="text-[var(--color-gold)]">{next.perDay}</strong>/jour
        </p>
      )}

      <button
        onClick={onClaim}
        disabled={claiming || pending <= 0}
        className="btn btn-arcane w-full text-sm disabled:opacity-40"
      >
        {claiming
          ? 'Encaissement…'
          : pending > 0
            ? `Encaisser ${pending} ${resourceMeta(ETERNITY_RESOURCE).label}`
            : `Rien à encaisser`}
      </button>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
  icon = false,
}: {
  label: string;
  value: string;
  color: string;
  icon?: boolean;
}) {
  return (
    <div className="rounded-lg bg-white/5 px-2 py-2">
      <div className="flex items-center justify-center gap-1 font-display text-xl font-bold tabular-nums" style={{ color }}>
        {icon && <ResourceIcon resKey={ETERNITY_RESOURCE} size={16} />}
        {value}
      </div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        {label}
      </div>
    </div>
  );
}

function GauntletResult({ run, onReplay }: { run: GauntletRunResponse; onReplay: () => void }) {
  const gained = run.cleared_new > 0;
  return (
    <div className="panel anim-pop space-y-3 p-4">
      <span
        className={`flex items-center gap-1.5 font-display text-lg font-bold ${
          gained ? 'text-[var(--color-gold)]' : 'text-[var(--color-ember)]'
        }`}
      >
        <UiIcon name={gained ? 'victory' : 'defeat'} size={20} color="currentColor" />
        {gained
          ? `Nouveau record : vague ${run.best_wave} (+${run.cleared_new}) !`
          : `Arrêt à la vague ${run.reached_wave} — record inchangé (${run.best_wave})`}
      </span>

      <p className="text-xs text-[var(--color-muted)]">
        Rente actuelle : <strong className="text-[var(--color-gold)]">{run.per_day}</strong>{' '}
        {resourceMeta(ETERNITY_RESOURCE).label}/jour.
        {run.banked_eternity > 0 && (
          <>
            {' '}
            Encaissé au passage :{' '}
            <strong className="text-[var(--color-gold-soft)]">+{run.banked_eternity}</strong>.
          </>
        )}
      </p>

      {run.wave_results.length > 0 && (
        <button onClick={onReplay} className="btn btn-arcane w-full text-sm">
          ▶ Revoir la course ({run.wave_results.length} vague
          {run.wave_results.length > 1 ? 's' : ''})
        </button>
      )}
    </div>
  );
}

function GauntletReplay({
  waves,
  index,
  onIndex,
  onClose,
  auto,
  onToggleAuto,
}: {
  waves: GauntletWaveResult[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  auto: boolean;
  onToggleAuto: () => void;
}) {
  const wave = waves[index]!;
  const hasPrev = index > 0;
  const hasNext = index < waves.length - 1;
  const lost = wave.combat.result === 'loss';

  const [finished, setFinished] = useState(false);
  useEffect(() => {
    setFinished(false);
  }, [index]);
  useEffect(() => {
    if (!finished || !auto || !hasNext || lost) return;
    const t = setTimeout(() => onIndex(index + 1), AUTO_NEXT_MS);
    return () => clearTimeout(t);
  }, [finished, auto, hasNext, lost, index, onIndex]);

  return (
    <CombatReplay
      key={index}
      combat={toStored(wave.combat)}
      enemyKind={wave.isBoss ? 'boss' : 'normal'}
      onClose={onClose}
      onDone={() => setFinished(true)}
      title={`Vague ${wave.wave}${wave.isBoss ? ' — Boss' : ''}`}
      headerExtra={
        <button
          onClick={onToggleAuto}
          title="Enchaîner automatiquement les vagues (l'escouade récupère tous ses PV entre chaque)"
          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
            auto
              ? 'border-[var(--color-arcane)] bg-[var(--color-arcane)]/20 text-[var(--color-ink)]'
              : 'border-[var(--color-edge)] text-[var(--color-muted)] hover:text-[var(--color-ink)]'
          }`}
        >
          {auto ? '⏩ Auto ON' : '⏩ Auto'}
        </button>
      }
      footer={
        <div className="mt-3 flex flex-col items-center gap-2">
          {finished && auto && hasNext && !lost && (
            <span className="text-[11px] text-[var(--color-arcane)]">
              Vague suivante dans un instant… (Auto)
            </span>
          )}
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => hasPrev && onIndex(index - 1)}
              disabled={!hasPrev}
              className="btn btn-ghost text-xs disabled:opacity-40"
            >
              ◀ Vague précédente
            </button>
            {hasNext && !lost ? (
              <button onClick={() => onIndex(index + 1)} className="btn btn-primary text-xs">
                Vague suivante ▶
              </button>
            ) : (
              <button onClick={onClose} className="btn btn-primary text-xs">
                Voir le bilan
              </button>
            )}
          </div>
        </div>
      }
    />
  );
}
