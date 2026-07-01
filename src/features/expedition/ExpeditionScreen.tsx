import { useEffect, useState } from 'react';
import { useHeroes, type HeroView } from '@/features/heroes/useHeroes';
import { useDungeons, type DungeonView } from '@/features/dungeons/useDungeons';
import { classMeta, stars } from '@/lib/gameUi';
import { computeAccrual, OFFLINE_CAP_SECONDS, expeditionRates } from '@shared/progression/idle';
import { useExpedition, type ClaimResult, type ExpeditionRow } from './useExpedition';

const MAX_TEAM = 4;

const DANGER: Record<number, string> = { 1: '#5fd39b', 2: '#e8b64a', 3: '#f0934a', 4: '#f06b4a' };

/** Renvoie Date.now() rafraîchi chaque seconde tant que `active`. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export function ExpeditionScreen() {
  const { status, start, stop, claim } = useExpedition();
  const { data: heroes } = useHeroes();
  const { data: dungeons } = useDungeons();

  const [lastClaim, setLastClaim] = useState<ClaimResult | null>(null);

  const expedition = status.data?.expedition ?? null;

  if (status.isLoading) {
    return <p className="anim-fade text-[var(--color-muted)]">Reconnaissance en cours…</p>;
  }

  return (
    <section className="anim-fade space-y-6">
      <div>
        <h2 className="heading text-2xl">Expédition</h2>
        <p className="text-sm text-[var(--color-muted)]">
          Envoie une équipe farmer une zone en continu — les gains s'accumulent même hors-ligne.
        </p>
      </div>

      {expedition ? (
        <ActiveExpedition
          expedition={expedition}
          heroes={heroes ?? []}
          dungeons={dungeons ?? []}
          onClaim={() => claim.mutate(undefined, { onSuccess: (data) => setLastClaim(data) })}
          claiming={claim.isPending}
          onStop={() => {
            setLastClaim(null);
            stop.mutate();
          }}
          stopping={stop.isPending}
          lastClaim={lastClaim}
        />
      ) : (
        <SetupExpedition
          heroes={heroes ?? []}
          dungeons={dungeons ?? []}
          onStart={(dungeonId, heroIds) => start.mutate({ dungeonId, heroIds })}
          starting={start.isPending}
          error={start.error instanceof Error ? start.error.message : null}
        />
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function SetupExpedition({
  heroes,
  dungeons,
  onStart,
  starting,
  error,
}: {
  heroes: HeroView[];
  dungeons: DungeonView[];
  onStart: (dungeonId: string, heroIds: string[]) => void;
  starting: boolean;
  error: string | null;
}) {
  const [dungeonId, setDungeonId] = useState<string | null>(null);
  const [team, setTeam] = useState<string[]>([]);

  function toggle(id: string) {
    setTeam((prev) =>
      prev.includes(id)
        ? prev.filter((h) => h !== id)
        : prev.length >= MAX_TEAM
          ? prev
          : [...prev, id],
    );
  }

  const canStart = dungeonId !== null && team.length >= 1 && !starting;

  return (
    <div className="space-y-5">
      <div className="panel p-4">
        <h3 className="mb-3 text-sm font-semibold text-[var(--color-muted)]">
          Équipe · {team.length}/{MAX_TEAM}
        </h3>
        <div className="flex flex-wrap gap-2">
          {heroes.map((hero) => {
            const meta = classMeta(hero.classId);
            const active = team.includes(hero.id);
            return (
              <button
                key={hero.id}
                onClick={() => toggle(hero.id)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                  active
                    ? 'border-[var(--color-arcane)] bg-[var(--color-arcane)]/15 text-white'
                    : 'border-[var(--color-edge)] bg-black/20 text-[var(--color-muted)] hover:border-white/25'
                }`}
              >
                <span>{meta.icon}</span>
                {hero.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {dungeons.map((d) => {
          const s = stars(d.difficulty);
          const rates = expeditionRates(d.difficulty);
          const selected = dungeonId === d.id;
          return (
            <button
              key={d.id}
              onClick={() => setDungeonId(d.id)}
              className={`panel panel-hover p-4 text-left ${
                selected ? 'ring-2 ring-[var(--color-arcane)]' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <h4 className="font-display font-semibold text-[var(--color-ink)]">{d.name}</h4>
                <span style={{ color: DANGER[d.difficulty] ?? '#f06b4a' }}>
                  {'★'.repeat(s.full)}
                  <span className="text-[var(--color-edge)]">{'★'.repeat(s.empty)}</span>
                </span>
              </div>
              <div className="mt-2 flex gap-3 text-xs text-[var(--color-muted)]">
                <span>💰 {rates.goldPerMin}/min</span>
                <span>✨ {rates.xpPerMinPerHero}/min·héros</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="panel flex flex-wrap items-center justify-between gap-3 p-4">
        <span className="text-sm text-[var(--color-muted)]">
          {canStart ? 'Prêt à partir.' : 'Choisis une zone et au moins 1 héros.'}
          {error && <span className="ml-2 text-[var(--color-ember)]">{error}</span>}
        </span>
        <button
          onClick={() => dungeonId && onStart(dungeonId, team)}
          disabled={!canStart}
          className="btn btn-arcane"
        >
          {starting ? 'Départ…' : '🗺️ Lancer l’expédition'}
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ActiveExpedition({
  expedition,
  heroes,
  dungeons,
  onClaim,
  claiming,
  onStop,
  stopping,
  lastClaim,
}: {
  expedition: ExpeditionRow;
  heroes: HeroView[];
  dungeons: DungeonView[];
  onClaim: () => void;
  claiming: boolean;
  onStop: () => void;
  stopping: boolean;
  lastClaim: ClaimResult | null;
}) {
  const now = useNow(true);
  const dungeon = dungeons.find((d) => d.id === expedition.dungeon_id);
  const difficulty = dungeon?.difficulty ?? 1;
  const team = heroes.filter((h) => expedition.hero_ids.includes(h.id));

  const elapsed = (now - Date.parse(expedition.last_claimed_at)) / 1000;
  const accrual = computeAccrual(difficulty, elapsed);
  const capPct = Math.min(100, Math.round((accrual.effectiveSeconds / OFFLINE_CAP_SECONDS) * 100));
  const hasSomething = accrual.gold > 0 || accrual.xpPerHero > 0;

  return (
    <div className="space-y-5">
      <div className="panel anim-pulse relative overflow-hidden p-5">
        <div
          className="absolute inset-x-0 top-0 h-[3px]"
          style={{
            background: `linear-gradient(90deg, transparent, ${DANGER[difficulty] ?? '#f06b4a'}, transparent)`,
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[var(--color-muted)]">
              En expédition
            </div>
            <h3 className="font-display text-xl font-bold text-[var(--color-ink)]">
              {dungeon?.name ?? expedition.dungeon_id}
            </h3>
          </div>
          <div className="flex -space-x-2">
            {team.map((h) => (
              <span
                key={h.id}
                title={h.name}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-edge)] bg-[var(--color-panel)] text-sm"
              >
                {classMeta(h.classId).icon}
              </span>
            ))}
          </div>
        </div>

        {/* Gains en cours */}
        <div className="mt-5 grid grid-cols-3 gap-3 text-center">
          <Accrued icon="💰" label="Or" value={accrual.gold} tone="text-[var(--color-gold)]" />
          <Accrued
            icon="✨"
            label="XP / héros"
            value={accrual.xpPerHero}
            tone="text-[var(--color-arcane)]"
          />
          <Accrued icon="🗺️" label="Aventures" value={accrual.adventures} tone="text-emerald-300" />
        </div>

        {/* Progression vers le plafond */}
        <div className="mt-5">
          <div className="mb-1 flex justify-between text-[10px] text-[var(--color-muted)]">
            <span>Réserve hors-ligne</span>
            <span>{capPct}% du plafond (8 h)</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-black/40">
            <div
              className={`h-full rounded-full transition-all ${
                accrual.capped
                  ? 'bg-[var(--color-ember)]'
                  : 'bg-gradient-to-r from-[var(--color-arcane)] to-[var(--color-gold)]'
              }`}
              style={{ width: `${capPct}%` }}
            />
          </div>
          {accrual.capped && (
            <p className="mt-1 text-xs text-[var(--color-ember)]">
              Plafond atteint — réclame pour relancer l'accumulation.
            </p>
          )}
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            onClick={onClaim}
            disabled={claiming || !hasSomething}
            className="btn btn-primary flex-1"
          >
            {claiming ? 'Récolte…' : '✋ Réclamer les gains'}
          </button>
          <button onClick={onStop} disabled={stopping} className="btn btn-ghost">
            {stopping ? '…' : 'Arrêter'}
          </button>
        </div>
      </div>

      {lastClaim && (
        <div className="panel anim-slide p-4">
          <h4 className="font-display mb-2 font-semibold text-[var(--color-gold-soft)]">
            Dernière récolte
          </h4>
          <ul className="space-y-1 text-sm text-[var(--color-ink)]/90">
            {lastClaim.feed.map((line, i) => (
              <li key={i} className="anim-float">
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Accrued({
  icon,
  label,
  value,
  tone,
}: {
  icon: string;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-edge)] bg-black/30 py-3">
      <div className="text-lg">{icon}</div>
      <div className={`font-display text-2xl font-bold tabular-nums ${tone}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-[var(--color-muted)]">{label}</div>
    </div>
  );
}
