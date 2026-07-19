import { useState } from 'react';
import { useHeroes } from '@/features/heroes/useHeroes';
import {
  useDummyStatus,
  useRunDummy,
  usePantinLeaderboard,
  type DummyRunResult,
  type PantinRankRow,
} from './useDailyDummy';
import { ClassIcon, UiIcon } from '@/components/synty/GameIcons';
import { classMeta } from '@/lib/gameUi';
import { BackToVillage } from '@/components/BackToVillage';
import { CombatReplay, type StoredCombat } from '@/components/CombatReplay';
import { PANTIN_GOLD_MIN } from '@shared/progression/pantin';
import { useAuthStore } from '@/store/authStore';

const MAX_TEAM = 5;

export function PantinScreen() {
  const { data: heroes } = useHeroes();
  const { data: status } = useDummyStatus();
  const run = useRunDummy();

  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<DummyRunResult | null>(null);
  const [replay, setReplay] = useState<StoredCombat | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Le pantin ne meurt jamais (combat "loss" côté moteur) : on force `win` pour
  // l'affichage — c'est un entraînement, pas un duel gagné/perdu.
  const toReplay = (r: DummyRunResult): StoredCombat => ({ ...r.combat, result: 'win' });

  const doneToday = status?.done_today ?? false;

  function toggle(id: string) {
    setPicked((cur) =>
      cur.includes(id) ? cur.filter((h) => h !== id) : cur.length < MAX_TEAM ? [...cur, id] : cur,
    );
  }

  function hit() {
    setError(null);
    setResult(null);
    run.mutate(picked, {
      onSuccess: (r) => {
        setResult(r);
        setReplay(toReplay(r)); // ouvre le replay du combat aussitôt
      },
      onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
    });
  }

  return (
    <section className="anim-fade space-y-5">
      <BackToVillage />

      <div className="panel p-5">
        <h2 className="heading flex items-center gap-2 text-xl">
          <UiIcon name="squad" size={22} color="var(--color-gold-soft)" />
          Pantin d'entraînement
        </h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Ton équipe frappe un mannequin qui ne riposte jamais pendant {status?.rounds ?? 50} tours.
        </p>

        {/* Les deux règles du mode, mises au même niveau que le titre : elles
            étaient noyées en fin de paragraphe et personne ne les lisait. */}
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="flex items-start gap-2.5 rounded-xl border border-[var(--color-gold)]/40 bg-[var(--color-gold)]/10 p-3">
            <UiIcon name="gold" size={20} color="var(--color-gold-soft)" />
            <div>
              <div className="font-display text-sm font-bold text-[var(--color-gold-soft)]">
                1 dégât = 1 or
              </div>
              <div className="text-[11px] leading-snug text-[var(--color-muted)]">
                Ton score EST ta récompense : tout le dégât infligé est converti en or, sans
                plafond. Minimum garanti&nbsp;: {PANTIN_GOLD_MIN.toLocaleString('fr-FR')} or.
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2.5 rounded-xl border border-[var(--color-arcane)]/40 bg-[var(--color-arcane)]/10 p-3">
            <UiIcon name="loop" size={20} color="var(--color-arcane)" />
            <div>
              <div className="font-display text-sm font-bold text-[var(--color-arcane)]">
                1 seule attaque par jour
              </div>
              <div className="text-[11px] leading-snug text-[var(--color-muted)]">
                {doneToday
                  ? 'Déjà frappé aujourd’hui. Remise à zéro à minuit (heure de Paris).'
                  : 'Une tentative, puis remise à zéro à minuit (heure de Paris). Compose bien ton équipe.'}
              </div>
            </div>
          </div>
        </div>

        {typeof status?.best_score === 'number' && status.best_score > 0 && (
          <p className="mt-2 text-xs text-[var(--color-muted)]">
            Ton meilleur score :{' '}
            <span className="font-semibold text-[var(--color-ink)]">
              {status.best_score.toLocaleString('fr-FR')}
            </span>{' '}
            dégâts
          </p>
        )}
      </div>

      <PantinLeaderboard />

      {/* Sélection d'équipe */}
      <div className="panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-display text-sm font-bold text-[var(--color-ink)]">
            Ton équipe · {picked.length}/{MAX_TEAM}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(heroes ?? []).map((h) => {
            const chosen = picked.includes(h.id);
            const full = picked.length >= MAX_TEAM && !chosen;
            const meta = classMeta(h.classId);
            return (
              <button
                key={h.id}
                onClick={() => toggle(h.id)}
                disabled={full}
                className={`flex items-center gap-2 rounded-lg border p-2 text-left text-sm transition ${
                  chosen
                    ? 'border-[var(--color-gold-soft)]/60 bg-[var(--color-gold-soft)]/10'
                    : full
                      ? 'border-[var(--color-edge)] opacity-40'
                      : 'border-[var(--color-edge)] hover:border-[var(--color-gold-soft)]/40'
                }`}
              >
                <ClassIcon classId={h.classId} size={22} />
                <span className="min-w-0">
                  <span className="block truncate text-[var(--color-ink)]">{h.name}</span>
                  <span className="block text-[10px]" style={{ color: meta.accent }}>
                    {meta.label} · N.{h.level} · {h.grade}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Action + résultat */}
      <div className="panel p-4">
        {doneToday && !result ? (
          <p className="text-sm text-[var(--color-gold-soft)]">
            Tu as déjà frappé le pantin aujourd'hui — reviens demain.
          </p>
        ) : (
          <button
            onClick={hit}
            disabled={picked.length === 0 || run.isPending || doneToday}
            className="btn btn-primary text-sm"
          >
            {run.isPending ? 'Combat en cours…' : 'Frapper le pantin'}
          </button>
        )}

        {error && <p className="mt-3 text-sm text-[var(--color-ember)]">{error}</p>}

        {result && (
          <div className="mt-4 rounded-lg border border-[var(--color-gold-soft)]/40 bg-[var(--color-gold-soft)]/[0.06] p-4">
            <div className="text-sm text-[var(--color-muted)]">Score (dégâts infligés)</div>
            <div className="font-display text-3xl font-bold text-[var(--color-ink)]">
              {result.score.toLocaleString('fr-FR')}
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-sm">
              <span className="text-[var(--color-muted)]">Récompense :</span>
              <span className="inline-flex items-center gap-1 font-semibold text-[var(--color-gold-soft)]">
                {result.reward.gold.toLocaleString('fr-FR')} <UiIcon name="gold" size={13} color="var(--color-gold-soft)" />
              </span>
            </div>
            <button onClick={() => setReplay(toReplay(result))} className="btn btn-ghost mt-3 text-xs">
              ▶ Revoir le combat
            </button>
          </div>
        )}
      </div>

      {replay && (
        <CombatReplay
          combat={replay}
          title="Pantin d'entraînement"
          onClose={() => setReplay(null)}
          footer={
            result && (
              <div className="mt-3 text-center text-sm">
                <span className="text-[var(--color-muted)]">Score : </span>
                <span className="font-display font-bold text-[var(--color-ink)]">
                  {result.score.toLocaleString('fr-FR')}
                </span>
                <span className="text-[var(--color-muted)]"> · Récompense : </span>
                <span className="inline-flex items-center gap-1 font-semibold text-[var(--color-gold-soft)]">
                  {result.reward.gold.toLocaleString('fr-FR')} <UiIcon name="gold" size={12} color="var(--color-gold-soft)" />
                </span>
              </div>
            )
          }
        />
      )}
    </section>
  );
}

/** Top 10 all-time, plus la ligne du joueur s'il est en dehors. */
function PantinLeaderboard() {
  const { data, isLoading } = usePantinLeaderboard();
  const me = useAuthStore((s) => s.user?.id);

  if (isLoading) return null;
  const top = data?.top ?? [];
  if (top.length === 0) return null;

  return (
    <div className="panel p-4">
      <div className="mb-2 flex items-center gap-2">
        <UiIcon name="leaderboard" size={16} color="var(--color-gold-soft)" />
        <span className="font-display text-sm font-bold text-[var(--color-ink)]">
          Meilleurs frappeurs — de tous les temps
        </span>
      </div>
      <div className="space-y-1">
        {top.map((row) => (
          <RankLine key={row.player_id} row={row} isMe={row.player_id === me} />
        ))}
        {/* Le joueur hors top 10 : on affiche sa ligne détachée, avec une
            ellipse pour que l'écart de rang soit lisible d'un coup d'œil. */}
        {data?.me && (
          <>
            <div className="py-0.5 text-center text-[10px] text-[var(--color-muted)]/60">⋯</div>
            <RankLine row={data.me} isMe />
          </>
        )}
      </div>
      {!data?.me && !top.some((r) => r.player_id === me) && (
        <p className="mt-2 text-[11px] text-[var(--color-muted)]">
          Frappe le pantin au moins une fois pour entrer au classement.
        </p>
      )}
    </div>
  );
}

function RankLine({ row, isMe }: { row: PantinRankRow; isMe: boolean }) {
  const medal = row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : null;
  return (
    <div
      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
        isMe ? 'bg-[var(--color-arcane)]/15 ring-1 ring-[var(--color-arcane)]/40' : 'bg-black/20'
      }`}
    >
      <span className="w-7 shrink-0 text-center text-xs font-bold text-[var(--color-muted)]">
        {medal ?? `#${row.rank}`}
      </span>
      <span className="min-w-0 flex-1 truncate font-semibold text-[var(--color-ink)]">
        {row.display_name ?? 'Commandant'}
        {isMe && <span className="ml-1 text-[10px] text-[var(--color-arcane)]">(toi)</span>}
      </span>
      {row.title && (
        <span className="hidden shrink-0 text-[10px] text-[var(--color-gold-soft)] sm:inline">
          {row.title}
        </span>
      )}
      <span className="shrink-0 font-display text-sm font-bold text-[var(--color-gold-soft)]">
        {row.best_score.toLocaleString('fr-FR')}
      </span>
    </div>
  );
}
