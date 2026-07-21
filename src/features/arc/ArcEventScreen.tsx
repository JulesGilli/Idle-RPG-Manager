import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useHeroes } from '@/features/heroes/useHeroes';
import {
  useHeroAvailability,
  heroIsBusy,
  HERO_STATUS_LABEL,
} from '@/features/heroes/useHeroAvailability';
import { classMeta, compactNumber } from '@/lib/gameUi';
import { classWeaponCleanUrl, MAP_ART } from '@/lib/synty';
import { SyntyGlyph, SyntyImg } from '@/components/synty/SyntyIcon';
import { UiIcon } from '@/components/synty/GameIcons';
import { BackToActivities } from '@/components/BackToActivities';
import { CombatReplay, type StoredCombat } from '@/components/CombatReplay';
import { formatCountdown } from '@/features/release/useRelease';
import {
  ARC_BOSS_NAME,
  ARC_EVENT_BELL_THRESHOLD,
  ARC_EVENT_HIT_COOLDOWN_HOURS,
} from '@shared/progression/arcEvent';
import { ArcArena } from './ArcBossScreen';
import { useClassLimit } from '@/features/heroes/useClassLimit';
import { tooManySameClassError } from '@shared/progression/teamComposition';
import { useArcEvent, type ArcEventHitResponse, type ArcEventLeader } from './useArcEvent';

const MAX_TEAM = 5;

function toStored(c: ArcEventHitResponse['combat']): StoredCombat {
  return { rounds: c.rounds, result: c.result, events: c.events, final_state: c.final_state };
}

/** Compte à rebours vivant jusqu'à une échéance ISO. */
function Countdown({ target, doneLabel }: { target: string | null; doneLabel?: string }) {
  const ts = target ? Date.parse(target) : NaN;
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const remaining = Number.isNaN(ts) ? 0 : Math.max(0, ts - Date.now());
  if (remaining <= 0) {
    return <span className="text-[var(--color-gold-soft)]">{doneLabel ?? 'maintenant'}</span>;
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
  const status = event?.status;
  const isPending = status === 'pending';
  const isActive = status === 'active';
  /** Phase 2 : le boss est à terre, ce sont ses cœurs qu'on frappe. */
  const isPhase2 = isActive && event?.phase === 2;
  const arenaActive = isPending || isActive;
  const arc2Open = Boolean(data?.arc2_open);
  // Panneau d'invocation : aucun combat en cours (ni pending ni active) et l'Arc 2
  // pas encore ouvert (sinon on montre le bandeau de victoire).
  const showSummon = Boolean(data) && !arenaActive && !arc2Open;

  const { classFull } = useClassLimit(heroList, picked);

  function toggleHero(id: string) {
    if (heroIsBusy(availability.get(id))) return;
    const h = heroList.find((x) => x.id === id);
    if (h && classFull(h.id, h.classId)) return;
    setPicked((cur) =>
      cur.includes(id) ? cur.filter((h2) => h2 !== id) : cur.length < MAX_TEAM ? [...cur, id] : cur,
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

  // Tout le serveur peut frapper (pas de condition d'éligibilité) — la seule barrière
  // est le cooldown personnel (`can_hit_now`).
  const canHit = isActive && Boolean(data?.can_hit_now) && picked.length > 0 && !hit.isPending;

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

      {/* Arène : boss dressé dès la préparation, jusqu'à la fin du combat. */}
      <div className="panel overflow-hidden p-0">
        <ArcArena active={arenaActive} />
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

      {/* Aucun combat en cours : invoquer, ou panneau d'info sur l'éligibilité. */}
      {showSummon && data && (
        <div className="panel space-y-3 p-4">
          {data.can_summon ? (
            <>
              <p className="text-sm text-[var(--color-muted)]">
                Assez de commandants ont <strong>prouvé leur force</strong> : le rituel peut commencer.
                Sonne la Cloche du Désespoir pour <strong>invoquer l'Être</strong> — tout le serveur
                pourra alors le frapper, encore et encore, jusqu'à sa chute.
              </p>
              {status === 'expired' && (
                <p className="text-sm text-[var(--color-gold-soft)]">
                  Le boss s'est retiré — sonnez à nouveau la cloche pour le rappeler.
                </p>
              )}
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
              {status === 'expired' && (
                <p className="text-[var(--color-gold-soft)]">
                  Le boss s'est retiré — sonnez à nouveau la cloche pour le rappeler.
                </p>
              )}
              <p className="flex items-center gap-2 text-[var(--color-ink)]">
                <span className="chip bg-[var(--color-arcane)]/15 text-[var(--color-arcane)] tabular-nums">
                  {data.eligible_count}/{ARC_EVENT_BELL_THRESHOLD} commandants réunis
                </span>
              </p>
            </div>
          )}
        </div>
      )}

      {/* Préparation : le boss se matérialise, compte à rebours jusqu'à l'invocation. */}
      {isPending && event && (
        <div className="panel space-y-2 p-4 text-center">
          <span className="flex items-center justify-center gap-2 font-display text-lg font-bold text-[var(--color-ink)]">
            <UiIcon name="dragon" size={20} color="var(--color-gold-soft)" /> L'Être approche…
          </span>
          <p className="text-sm text-[var(--color-muted)]">
            {event.boss_name} se matérialise. Rassemblez vos escouades — le combat commence bientôt.
          </p>
          <div className="flex items-center justify-center gap-1.5 text-sm">
            <UiIcon name="loop" size={13} color="var(--color-muted)" />
            <span className="text-[var(--color-muted)]">Invocation dans</span>
            <Countdown target={event.invoke_at} doneLabel="imminente" />
          </div>
        </div>
      )}

      {/* Combat actif : barre de PV, compte à rebours, escouade, frappe. */}
      {isActive && event && (
        <>
          {/* PHASE 2 — l'Être est à terre. Le bandeau passe AVANT le panneau de
              combat : c'est l'information qui change tout (urgence + fenêtre), et
              un joueur qui ouvre l'écran doit la lire sans avoir à chercher. */}
          {isPhase2 && (
            <div className="panel anim-pop space-y-2 border border-[var(--color-ember)]/50 bg-[var(--color-ember)]/10 p-4">
              <span className="flex items-center gap-2 font-display text-lg font-bold text-[var(--color-ember)]">
                <UiIcon name="warning" size={20} color="currentColor" /> L'Être est à terre !
              </span>
              <p className="text-sm text-[var(--color-ink)]/90">
                Sa carapace s'est fendue et découvre <strong>ses {event.hearts_total} cœurs de
                démon</strong>. Ils ne se défendent pas et se présentent <strong>tous les
                {' '}{event.hearts_total} à la fois</strong> — les escouades qui frappent en zone
                les entament toutes d'un coup. Brisez-les, et l'Être meurt pour de bon.
              </p>
              <div className="flex items-center gap-1.5 text-sm">
                <UiIcon name="loop" size={13} color="var(--color-ember)" />
                <span className="text-[var(--color-muted)]">Il se retire dans</span>
                <Countdown target={event.deadline} doneLabel="il se retire…" />
              </div>
            </div>
          )}

          <div className="panel space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-display text-lg font-bold text-[var(--color-ink)]">
                <UiIcon name="dragon" size={20} color="var(--color-gold-soft)" /> {event.boss_name}
              </span>
              <span className="chip bg-white/5 text-[11px] text-[var(--color-muted)]">
                {event.eligible_count} participant(s)
              </span>
            </div>

            {/* Phase 2 : les cinq cœurs, tous présents à chaque combat. On ne les
                grise jamais un par un — ce serait mentir sur ce que le joueur va
                affronter, et effacer l'argument de la phase (frapper les 5 d'un coup). */}
            {isPhase2 && (
              <div className="flex flex-wrap items-center gap-2">
                {Array.from({ length: event.hearts_total }, (_, i) => (
                  <span
                    key={i}
                    title={`Cœur ${i + 1} — ${compactNumber(event.heart_hp)} PV`}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-ember)]/70 bg-[var(--color-ember)]/15 text-lg"
                  >
                    🖤
                  </span>
                ))}
                <span className="text-xs text-[var(--color-muted)]">
                  {event.hearts_total} cœurs, {compactNumber(event.heart_hp)} PV chacun — tous dans
                  le même combat
                </span>
              </div>
            )}

            {/* Barre de PV communautaire. */}
            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-[var(--color-muted)]">
                  {isPhase2 ? 'PV des cœurs' : 'PV du boss'}
                </span>
                <span className="tabular-nums font-semibold text-[var(--color-ink)]">
                  {compactNumber(event.hp_current)} / {compactNumber(event.hp_max)}
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-black/50">
                <div
                  className={`h-full transition-all duration-500 ${
                    isPhase2
                      ? 'bg-gradient-to-r from-purple-700 to-fuchsia-400'
                      : 'bg-gradient-to-r from-rose-600 to-rose-400'
                  }`}
                  style={{
                    width: `${Math.max(0, Math.min(100, (event.hp_current / Math.max(1, event.hp_max)) * 100))}%`,
                  }}
                />
              </div>
            </div>

            {!isPhase2 && (
              <div className="flex items-center gap-1.5 text-xs">
                <UiIcon name="loop" size={13} color="var(--color-muted)" />
                <span className="text-[var(--color-muted)]">Se retire dans :</span>
                <Countdown target={event.deadline} doneLabel="il se retire…" />
              </div>
            )}
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
                  const capped = classFull(h.id, h.classId);
                  const busy = heroIsBusy(availability.get(h.id)) || capped;
                  const chosen = picked.includes(h.id);
                  const meta = classMeta(h.classId);
                  return (
                    <button
                      key={h.id}
                      onClick={() => toggleHero(h.id)}
                      disabled={busy}
                      title={
                        capped
                          ? tooManySameClassError()
                          : busy
                            ? `${h.name} — ${HERO_STATUS_LABEL[availability.get(h.id)!]}`
                            : h.name
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
            {hit.isPending ? (
              'Assaut…'
            ) : !data?.can_hit_now ? (
              <span className="inline-flex items-center gap-1.5">
                Prochaine frappe dans{' '}
                <Countdown target={data?.next_hit_at ?? null} doneLabel="maintenant" />
              </span>
            ) : (
              'Frapper le boss'
            )}
          </button>
          <p className="text-center text-[11px] text-[var(--color-muted)]">
            Chaque héros peut frapper toutes les {ARC_EVENT_HIT_COOLDOWN_HOURS} h.
          </p>

          {/* Contribution de la dernière frappe (hors replay). */}
          {result && !showReplay && (
            <div className="panel anim-pop space-y-2 p-4">
              <span className="flex items-center gap-1.5 font-display text-lg font-bold text-[var(--color-gold)]">
                <UiIcon name="attack" size={20} color="currentColor" /> Contribution :{' '}
                {compactNumber(result.damage)} dégâts
              </span>
              <p className="text-xs text-[var(--color-muted)]">
                PV restants : {compactNumber(result.hp_current)} / {compactNumber(result.hp_max)}
                {result.defeated && ' — l’Être est mort !'}
              </p>
              {/* Coup qui fait TOMBER le boss : c'est le joueur qui l'a porté, il
                  doit comprendre que le combat n'est pas fini mais qu'il change. */}
              {result.boss_down && (
                <p className="text-sm font-semibold text-[var(--color-ember)]">
                  Tu as mis l'Être à terre — ses cœurs de démon sont à découvert. Achevez-le !
                </p>
              )}
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
