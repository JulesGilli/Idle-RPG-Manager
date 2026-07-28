import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BackToActivities } from '@/components/BackToActivities';
import { BodyPortal } from '@/components/BodyPortal';
import { FavStar } from '@/components/FavoriteStar';
import { ClassIcon, UiIcon } from '@/components/synty/GameIcons';
import { CombatReplay, type StoredCombat } from '@/components/CombatReplay';
import { useAuthStore } from '@/store/authStore';
import { useHeroes, type HeroView } from '@/features/heroes/useHeroes';
import { PANTHEON_MIN_ARC } from '@shared/progression/pantheon';
import {
  usePantheonState,
  usePantheonLadder,
  usePantheonActions,
  type PantheonLadderRow,
  type PantheonChallengeResult,
  type PantheonMatch,
} from './usePantheon';

const ACCENT = '#d8b4fe';

export function PantheonScreen() {
  const userId = useAuthStore((s) => s.user?.id);
  const { data: state, isLoading } = usePantheonState();
  const { data: ladder } = usePantheonLadder();
  const { data: heroes } = useHeroes();
  const { setTeams, challenge } = usePantheonActions();

  const [composerOpen, setComposerOpen] = useState(false);
  const [result, setResult] = useState<PantheonChallengeResult | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const rows = ladder ?? [];
  const me = rows.find((r) => r.player_id === userId) ?? null;

  function onChallenge(row: PantheonLadderRow) {
    setFeedback(null);
    challenge.mutate(row.player_id, {
      onSuccess: (res) => {
        setResult(res);
        setFeedback(
          res.win
            ? `Victoire ${res.score.attacker}-${res.score.defender} ! Tu passes rang ${res.new_rank}.`
            : `Défaite ${res.score.attacker}-${res.score.defender} — tu gardes ton rang.`,
        );
      },
      onError: (e) => setFeedback(e instanceof Error ? e.message : 'Erreur'),
    });
  }

  return (
    <section className="anim-fade space-y-5">
      <BackToActivities />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="heading flex items-center gap-2 text-2xl">
            <span aria-hidden style={{ color: ACCENT }}>🏛️</span> Le Panthéon
          </h2>
          <p className="max-w-xl text-sm text-[var(--color-muted)]">
            Aligne <strong>5 équipes de 3</strong> (15 héros distincts), puis défie qui tu veux : vos
            cinq équipes s'affrontent une par une, la <strong>majorité l'emporte</strong>. Bats un joueur
            mieux classé pour lui prendre sa place.
          </p>
        </div>
        <Link to="/activities" className="btn btn-ghost text-xs">← Activités</Link>
      </div>

      {isLoading && <p className="text-[var(--color-muted)]">Chargement du Panthéon…</p>}

      {state && !state.unlocked && (
        <div className="panel p-6 text-center">
          <h3 className="heading text-xl">Temple scellé</h3>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            Le Panthéon s'ouvre en <strong>Arc {PANTHEON_MIN_ARC}</strong>.
          </p>
        </div>
      )}

      {state && state.unlocked && (
        <>
          {/* Mon statut + accès au composeur */}
          <div className="panel flex flex-wrap items-center justify-between gap-3 p-4">
            {state.in_pantheon ? (
              <div className="flex items-center gap-4 text-sm">
                <span className="font-display text-2xl font-bold" style={{ color: ACCENT }}>#{state.rank}</span>
                <span className="text-[var(--color-muted)]">
                  Puissance <span className="text-[var(--color-ink)]">{state.power}</span>
                </span>
                <span className="text-[var(--color-muted)]">
                  <span className="text-[var(--color-gold-soft)]">{state.wins}V</span> ·{' '}
                  <span className="text-[var(--color-ember)]">{state.losses}D</span>
                </span>
              </div>
            ) : (
              <span className="text-sm text-[var(--color-muted)]">
                Compose tes 5 équipes pour entrer dans le Panthéon.
              </span>
            )}
            <button
              onClick={() => setComposerOpen(true)}
              disabled={state.heroes_count < state.roster_required}
              className="btn btn-ghost text-xs disabled:opacity-40"
              title={
                state.heroes_count < state.roster_required
                  ? `Il te faut ${state.roster_required} héros (tu en as ${state.heroes_count}).`
                  : undefined
              }
            >
              {state.in_pantheon ? 'Modifier mes 5 équipes' : 'Composer mes 5 équipes'}
            </button>
          </div>

          {state.heroes_count < state.roster_required && (
            <p className="text-xs text-[var(--color-ember)]">
              Le Panthéon demande {state.roster_required} héros distincts — tu en as {state.heroes_count}. Recrute à
              la Taverne pour compléter.
            </p>
          )}

          {feedback && (
            <p className={`text-sm ${challenge.isError ? 'text-[var(--color-ember)]' : 'text-[var(--color-gold-soft)]'}`}>
              {feedback}
            </p>
          )}

          {/* Échelle */}
          <div className="panel overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-edge)] text-left text-[10px] uppercase tracking-widest text-[var(--color-muted)]">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Joueur</th>
                  <th className="px-4 py-3 text-right">Puissance</th>
                  <th className="hidden px-4 py-3 text-right sm:table-cell">V / D</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isMe = row.player_id === userId;
                  const canFight = Boolean(me) && !isMe;
                  const climbs = Boolean(me) && row.rank < me!.rank;
                  return (
                    <tr key={row.player_id} className={`border-b border-[var(--color-edge)]/60 ${isMe ? 'bg-[var(--color-arcane)]/12' : ''}`}>
                      <td className="px-4 py-2.5 font-display text-[var(--color-muted)]">{row.rank}</td>
                      <td className="px-4 py-2.5 text-[var(--color-ink)]">
                        {row.display_name}
                        {isMe && <span className="ml-2 text-xs text-[var(--color-arcane)]">(toi)</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-display font-bold text-[var(--color-gold)]">{row.power}</td>
                      <td className="hidden px-4 py-2.5 text-right text-[var(--color-muted)] sm:table-cell">
                        {row.wins} / {row.losses}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {canFight ? (
                          <button
                            onClick={() => onChallenge(row)}
                            disabled={challenge.isPending}
                            title={climbs ? 'Bats-le pour lui prendre sa place' : 'Plus bas que toi : victoire sans gain de rang'}
                            className={`px-2.5 py-1 text-xs ${climbs ? 'btn btn-primary' : 'btn btn-ghost'}`}
                          >
                            Défier
                          </button>
                        ) : (
                          <span className="text-[10px] text-[var(--color-muted)]/50">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-[var(--color-muted)]">
                      Le Panthéon est vide — sois le premier à y entrer !
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {composerOpen && state && (
        <TeamComposer
          heroes={heroes ?? []}
          initial={state.teams}
          teamsRequired={state.teams_required}
          teamSize={state.team_size}
          pending={setTeams.isPending}
          error={setTeams.error instanceof Error ? setTeams.error.message : null}
          onClose={() => setComposerOpen(false)}
          onSave={(teams) => setTeams.mutate(teams, { onSuccess: () => setComposerOpen(false) })}
        />
      )}

      {result && <SeriesResult result={result} onClose={() => setResult(null)} />}
    </section>
  );
}

/* ------------------------------------------------------- composeur 5×3 ----- */

function TeamComposer({
  heroes,
  initial,
  teamsRequired,
  teamSize,
  pending,
  error,
  onClose,
  onSave,
}: {
  heroes: HeroView[];
  initial: string[][];
  teamsRequired: number;
  teamSize: number;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (teams: string[][]) => void;
}) {
  // Grille 5×3 de slots ; on ignore les ids de héros qui n'existent plus.
  const known = useMemo(() => new Set(heroes.map((h) => h.id)), [heroes]);
  const [teams, setTeams] = useState<(string | null)[][]>(() =>
    Array.from({ length: teamsRequired }, (_, t) =>
      Array.from({ length: teamSize }, (_, h) => {
        const id = initial[t]?.[h];
        return id && known.has(id) ? id : null;
      }),
    ),
  );

  const assigned = useMemo(() => new Set(teams.flat().filter((x): x is string => x !== null)), [teams]);
  const pool = heroes.filter((h) => !assigned.has(h.id));
  const filled = assigned.size;
  const total = teamsRequired * teamSize;
  const heroById = useMemo(() => new Map(heroes.map((h) => [h.id, h])), [heroes]);

  /** Place un héros dans le PREMIER slot libre (équipe par équipe). */
  function assign(id: string) {
    setTeams((cur) => {
      const next = cur.map((t) => [...t]);
      for (const team of next) {
        const idx = team.indexOf(null);
        if (idx >= 0) {
          team[idx] = id;
          return next;
        }
      }
      return cur; // tout est plein
    });
  }
  function unassign(ti: number, hi: number) {
    setTeams((cur) => {
      const next = cur.map((t) => [...t]);
      next[ti]![hi] = null;
      return next;
    });
  }

  const complete = filled === total;

  return (
    <BodyPortal>
      <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
        <div className="panel anim-pop flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden sm:max-h-[85vh]">
          <div className="flex items-center justify-between border-b border-[var(--color-edge)] p-4">
            <h3 className="font-display text-lg font-semibold text-[var(--color-ink)]">
              Mes 5 équipes · {filled}/{total}
            </h3>
            <button onClick={onClose} className="text-[var(--color-muted)] hover:text-[var(--color-ink)]">✕</button>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {/* Les 5 équipes */}
            <div className="space-y-2">
              {teams.map((team, ti) => (
                <div key={ti} className="rounded-lg border border-[var(--color-edge)] bg-black/20 p-2">
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: ACCENT }}>
                    Équipe {ti + 1}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {team.map((id, hi) => {
                      const hero = id ? heroById.get(id) : null;
                      return (
                        <button
                          key={hi}
                          onClick={() => hero && unassign(ti, hi)}
                          className={`flex h-14 flex-col items-center justify-center gap-0.5 rounded-md border text-center transition ${
                            hero
                              ? 'border-[var(--color-arcane)]/50 bg-[var(--color-arcane)]/10 hover:border-[var(--color-ember)]/50'
                              : 'border-dashed border-[var(--color-edge)] text-[var(--color-muted)]/50'
                          }`}
                          title={hero ? `${hero.name} — retirer` : 'Slot vide'}
                        >
                          {hero ? (
                            <>
                              <ClassIcon classId={hero.classId} size={18} />
                              <span className="w-full truncate px-1 text-[9px] text-[var(--color-ink)]">{hero.name}</span>
                            </>
                          ) : (
                            <span className="text-lg">+</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Vivier de héros disponibles */}
            <div>
              <div className="mb-1.5 text-[10px] uppercase tracking-widest text-[var(--color-muted)]">
                Héros disponibles · {pool.length}
              </div>
              {pool.length === 0 ? (
                <p className="text-[11px] text-[var(--color-muted)]">Tous tes héros sont placés.</p>
              ) : (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {pool.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => assign(h.id)}
                      disabled={complete}
                      className="panel flex flex-col items-center gap-0.5 p-2 text-center transition hover:ring-2 hover:ring-[var(--color-arcane)] disabled:opacity-40"
                      title={complete ? 'Toutes les équipes sont pleines' : `Ajouter ${h.name}`}
                    >
                      <ClassIcon classId={h.classId} size={20} />
                      <span className="w-full truncate text-[9px] text-[var(--color-ink)]">
                        <FavStar on={h.favorite} />
                        {h.name}
                      </span>
                      <span className="text-[8px] text-[var(--color-muted)]">N.{h.level}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="shrink-0 space-y-2 border-t border-[var(--color-edge)] p-4">
            {error && <p className="text-sm text-[var(--color-ember)]">{error}</p>}
            <button
              onClick={() => complete && onSave(teams as string[][])}
              disabled={pending || !complete}
              className="btn btn-primary w-full text-sm disabled:opacity-40"
            >
              {pending ? 'Enregistrement…' : complete ? 'Valider mes 5 équipes' : `Encore ${total - filled} héros à placer`}
            </button>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
}

/* ---------------------------------------------------- résultat de série ---- */

function SeriesResult({ result, onClose }: { result: PantheonChallengeResult; onClose: () => void }) {
  const [replay, setReplay] = useState<PantheonMatch | null>(null);
  return (
    <BodyPortal>
      <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
        <div className="panel anim-pop w-full max-w-md space-y-3 p-5">
          <div className="text-center">
            <div
              className={`font-display text-2xl font-bold ${result.win ? 'text-[var(--color-gold)]' : 'text-[var(--color-ember)]'}`}
            >
              {result.win ? 'Victoire de la série' : 'Défaite de la série'}
            </div>
            <div className="mt-1 font-display text-3xl font-black tabular-nums text-[var(--color-ink)]">
              {result.score.attacker} <span className="text-[var(--color-muted)]">–</span> {result.score.defender}
            </div>
          </div>

          <div className="space-y-1.5">
            {result.matches.map((m) => (
              <div
                key={m.index}
                className="flex items-center justify-between rounded-lg border border-[var(--color-edge)] bg-black/20 px-3 py-2"
              >
                <span className="flex items-center gap-2 text-sm">
                  <UiIcon name={m.win ? 'victory' : 'defeat'} size={16} color="currentColor" />
                  <span className="text-[var(--color-ink)]">Manche {m.index + 1}</span>
                  <span className={m.win ? 'text-[var(--color-gold-soft)]' : 'text-[var(--color-ember)]'}>
                    {m.win ? 'gagnée' : 'perdue'}
                  </span>
                </span>
                <button onClick={() => setReplay(m)} className="btn btn-ghost px-2 py-0.5 text-[11px]">
                  Revoir
                </button>
              </div>
            ))}
          </div>

          <button onClick={onClose} className="btn btn-ghost w-full text-sm">Fermer</button>
        </div>
      </div>

      {replay && (
        <CombatReplay
          combat={replay.combat as StoredCombat}
          title={`Panthéon — manche ${replay.index + 1}`}
          enemyKind="normal"
          onClose={() => setReplay(null)}
        />
      )}
    </BodyPortal>
  );
}
