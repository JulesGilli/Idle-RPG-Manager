import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useHeroes } from '@/features/heroes/useHeroes';
import {
  useHeroAvailability,
  heroIsBusy,
  HERO_STATUS_LABEL,
} from '@/features/heroes/useHeroAvailability';
import { classMeta } from '@/lib/gameUi';
import { classWeaponCleanUrl, MAP_ART } from '@/lib/synty';
import { SyntyGlyph, SyntyImg } from '@/components/synty/SyntyIcon';
import { UiIcon } from '@/components/synty/GameIcons';
import { BackToActivities } from '@/components/BackToActivities';
import { CombatReplay, type StoredCombat } from '@/components/CombatReplay';
import { formatCountdown } from '@/features/release/useRelease';
import { ARC_BOSS_NAME, ARC_EVENT_BELL_THRESHOLD } from '@shared/progression/arcEvent';
import { ArcArena } from './ArcBossScreen';
import { useArcEvent, type ArcEventHitResponse, type ArcEventLeader } from './useArcEvent';

const MAX_TEAM = 5;

/** Formate un grand nombre en compact « 12.3M / 4.2k » (PV du boss communautaire). */
function compactNumber(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}Md`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(Math.round(n));
}

function toStored(c: ArcEventHitResponse['combat']): StoredCombat {
  return { rounds: c.rounds, result: c.result, events: c.events, final_state: c.final_state };
}

/** Compte à rebours vivant jusqu'à une échéance ISO. */
function Countdown({ deadline }: { deadline: string }) {
  const target = Date.parse(deadline);
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const remaining = Number.isNaN(target) ? 0 : Math.max(0, target - Date.now());
  if (remaining <= 0) {
    return <span className="text-[var(--color-gold-soft)]">Échéance atteinte — l'arc s'ouvre</span>;
  }
  return <span className="tabular-nums text-[var(--color-ink)]">{formatCountdown(remaining)}</span>;
}

export function ArcEventScreen() {
  const { state, summon, hit } = useArcEvent();
  const { data: heroes } = useHeroes();
  const availability = useHeroAvailability();

  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<ArcEventHitResponse | null>(null);
  const [showReplay, setShowReplay] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const data = state.data;
  const heroList = heroes ?? [];
  const event = data?.event ?? null;
  const active = Boolean(event) && event?.status !== 'defeated';

  function toggleHero(id: string) {
    if (heroIsBusy(availability.get(id))) return;
    setPicked((cur) =>
      cur.includes(id) ? cur.filter((h) => h !== id) : cur.length < MAX_TEAM ? [...cur, id] : cur,
    );
  }

  function doSummon() {
    setError(null);
    summon.mutate(undefined, {
      onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
    });
  }

  function doHit() {
    if (picked.length === 0) return;
    setError(null);
    setResult(null);
    setShowReplay(false);
    hit.mutate(picked, {
      onSuccess: (r) => {
        setResult(r);
        setShowReplay(true);
      },
      onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
    });
  }

  // Tout le serveur peut frapper (pas de condition d'éligibilité).
  const canHit = active && !data?.hit_today && picked.length > 0 && !hit.isPending;

  return (
    <section className="anim-fade space-y-5">
      <BackToActivities />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="heading flex items-center gap-2 text-2xl">
            <SyntyImg src={MAP_ART.dragon} size={26} />
            {ARC_BOSS_NAME}
          </h2>
          <p className="text-sm text-[var(--color-muted)]">
            L'événement communautaire qui clôt l'Arc 1. Frappe le boss avec le monde entier —
            terrassez-le ou tenez jusqu'à l'échéance pour <strong>ouvrir l'Arc 2</strong>.
          </p>
        </div>
        <Link to="/" className="btn btn-ghost text-xs">
          ← Activités
        </Link>
      </div>

      {/* Arène : boss dressé tant que l'event est actif. */}
      <div className="panel overflow-hidden p-0">
        <ArcArena active={active} />
      </div>

      {state.isLoading && <p className="text-[var(--color-muted)]">Chargement…</p>}

      {data?.arc2_open && (
        <div className="panel anim-pop flex flex-wrap items-center justify-between gap-3 border border-emerald-500/40 bg-emerald-500/10 p-4">
          <span className="flex items-center gap-2 font-display text-lg font-bold text-emerald-200">
            <UiIcon name="victory" size={20} color="currentColor" /> L'Arc 2 est ouvert !
          </span>
          <Link to="/arc" className="btn btn-primary text-sm">
            Choisir un arc
          </Link>
        </div>
      )}

      {/* Aucun event actif : invoquer, ou panneau d'info sur l'éligibilité. */}
      {data && !active && !data.arc2_open && (
        <div className="panel space-y-3 p-4">
          {data.can_summon ? (
            <>
              <p className="text-sm text-[var(--color-muted)]">
                Assez de commandants ont <strong>prouvé leur force</strong> : le rituel peut commencer.
                Sonne la Cloche du Désespoir pour <strong>invoquer l'Être</strong> — tout le serveur
                pourra alors le frapper, <strong>une fois par jour</strong>, jusqu'à sa chute.
              </p>
              {error && <p className="text-sm text-[var(--color-ember)]">{error}</p>}
              <button
                onClick={doSummon}
                disabled={summon.isPending}
                className="btn btn-primary w-full text-sm"
              >
                {summon.isPending ? 'Invocation…' : '🔔 Sonner la Cloche du Désespoir'}
              </button>
            </>
          ) : (
            <div className="space-y-2 text-sm text-[var(--color-muted)]">
              <p>
                <strong>{ARC_EVENT_BELL_THRESHOLD} commandants</strong> ayant{' '}
                <strong>prouvé leur force</strong> en terminant la carte du monde doivent se réunir
                pour <strong>invoquer l'Être</strong> — le boss d'arc communautaire dont la chute
                ouvrira l'arc suivant.
              </p>
              <p className="flex items-center gap-2 text-[var(--color-ink)]">
                <span className="chip bg-[var(--color-arcane)]/15 text-[var(--color-arcane)] tabular-nums">
                  {data.eligible_count}/{ARC_EVENT_BELL_THRESHOLD} réunis
                </span>
              </p>
              {!data.eligible && (
                <p className="text-[var(--color-ember)]">
                  Prouve d'abord ta force : termine la carte du monde pour rejoindre le rituel.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Event actif : barre de PV, compte à rebours, escouade, frappe. */}
      {active && event && (
        <>
          <div className="panel space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-display text-lg font-bold text-[var(--color-ink)]">
                <UiIcon name="dragon" size={20} color="var(--color-gold-soft)" /> {event.boss_name}
              </span>
              <span className="chip bg-white/5 text-[11px] text-[var(--color-muted)]">
                {event.eligible_count} participant(s)
              </span>
            </div>

            {/* Barre de PV communautaire. */}
            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-[var(--color-muted)]">PV du boss</span>
                <span className="tabular-nums font-semibold text-[var(--color-ink)]">
                  {compactNumber(event.hp_current)} / {compactNumber(event.hp_max)}
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-black/50">
                <div
                  className="h-full bg-gradient-to-r from-rose-600 to-rose-400 transition-all duration-500"
                  style={{
                    width: `${Math.max(0, Math.min(100, (event.hp_current / Math.max(1, event.hp_max)) * 100))}%`,
                  }}
                />
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs">
              <UiIcon name="loop" size={13} color="var(--color-muted)" />
              <span className="text-[var(--color-muted)]">Échéance :</span>
              <Countdown deadline={event.deadline} />
            </div>
          </div>

          {/* Escouade */}
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
              <p className="text-sm text-[var(--color-muted)]">
                Aucun héros — recrute à la Taverne.
              </p>
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
                      title={
                        busy ? `${h.name} — ${HERO_STATUS_LABEL[availability.get(h.id)!]}` : h.name
                      }
                      className={`panel flex flex-col items-center gap-1 p-2.5 text-center transition ${
                        busy
                          ? 'cursor-not-allowed opacity-40'
                          : chosen
                            ? 'ring-2 ring-[var(--color-arcane)]'
                            : 'opacity-80 hover:opacity-100'
                      }`}
                    >
                      <SyntyGlyph
                        src={classWeaponCleanUrl(h.classId)}
                        color={meta.accent}
                        size={30}
                      />
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

          {error && <p className="text-sm text-[var(--color-ember)]">{error}</p>}

          <button onClick={doHit} disabled={!canHit} className="btn btn-primary w-full text-sm">
            {hit.isPending
              ? 'Assaut…'
              : data?.hit_today
                ? 'Déjà frappé aujourd’hui — reviens demain'
                : 'Frapper le boss'}
          </button>

          {/* Contribution de la dernière frappe (hors replay). */}
          {result && !showReplay && (
            <div className="panel anim-pop space-y-2 p-4">
              <span className="flex items-center gap-1.5 font-display text-lg font-bold text-[var(--color-gold)]">
                <UiIcon name="attack" size={20} color="currentColor" /> Contribution :{' '}
                {compactNumber(result.damage)} dégâts
              </span>
              <p className="text-xs text-[var(--color-muted)]">
                PV restants : {compactNumber(result.hp_current)} / {compactNumber(result.hp_max)}
                {result.defeated && ' — boss terrassé !'}
              </p>
              <button
                onClick={() => setShowReplay(true)}
                className="btn btn-arcane w-full text-sm"
              >
                ▶ Revoir le combat
              </button>
            </div>
          )}
        </>
      )}

      {/* Classement des contributeurs (event courant ou dernier). */}
      {data && data.leaderboard.length > 0 && (
        <Leaderboard rows={data.leaderboard} />
      )}

      {/* Replay du combat de la frappe. */}
      {result && showReplay && (
        <CombatReplay
          combat={toStored(result.combat)}
          enemyKind="boss"
          title={`${event?.boss_name ?? ARC_BOSS_NAME} — ${compactNumber(result.damage)} dégâts`}
          onClose={() => setShowReplay(false)}
        />
      )}
    </section>
  );
}

function Leaderboard({ rows }: { rows: ArcEventLeader[] }) {
  return (
    <div className="panel space-y-2 p-4">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-muted)]">
        <UiIcon name="leaderboard" size={15} color="var(--color-gold-soft)" /> Meilleurs contributeurs
      </h3>
      <ul className="space-y-1">
        {rows.map((r, i) => (
          <li
            key={r.player_id}
            className="flex items-center justify-between gap-2 rounded-md bg-black/20 px-2.5 py-1.5 text-sm"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="w-5 text-right text-xs font-semibold text-[var(--color-muted)]">
                {i + 1}
              </span>
              <span className="truncate text-[var(--color-ink)]">{r.name}</span>
            </span>
            <span className="tabular-nums font-semibold text-[var(--color-gold-soft)]">
              {compactNumber(r.damage)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
