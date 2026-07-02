import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useProfile } from '@/hooks/useProfile';
import { classMeta } from '@/lib/gameUi';
import { GRADE_META } from '@shared/progression/recruit';
import { useHeroes, type HeroView } from './useHeroes';
import { useRecruit, useTavernPool, type TavernCandidate } from './useRecruit';

function useMidnightCountdown(): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const mins = Math.max(0, Math.round((midnight.getTime() - now) / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

export function TavernScreen() {
  const { data: heroes } = useHeroes();
  const { data: profile } = useProfile();
  const { data: pool, isLoading } = useTavernPool();
  const { recruit, dismiss } = useRecruit();
  const [feedback, setFeedback] = useState<string | null>(null);
  const countdown = useMidnightCountdown();

  const team = heroes ?? [];
  const gold = profile?.gold ?? 0;
  const maxRoster = pool?.max_roster ?? 5;
  const cost = pool?.cost ?? 0;
  const full = team.length >= maxRoster;
  const emptySlots = Math.max(0, maxRoster - team.length);

  function onRecruit(slot: number) {
    setFeedback(null);
    recruit.mutate(slot, {
      onError: (e) => setFeedback(e instanceof Error ? e.message : 'Erreur'),
    });
  }

  function onDismiss(hero: HeroView) {
    if (!window.confirm(`Renvoyer ${hero.name} ? Son équipement retourne dans ton sac.`)) return;
    setFeedback(null);
    dismiss.mutate(hero.id, {
      onError: (e) => setFeedback(e instanceof Error ? e.message : 'Erreur'),
    });
  }

  return (
    <section className="anim-fade space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="heading text-2xl">🍺 Taverne</h2>
          <p className="text-sm text-[var(--color-muted)]">
            Choisis tes recrues parmi les 8 du jour. Renouvelées à minuit (dans {countdown}).
          </p>
        </div>
        <Link to="/village" className="btn btn-ghost text-xs">
          ← Village
        </Link>
      </div>

      {feedback && <p className="text-sm text-[var(--color-ember)]">{feedback}</p>}

      {/* Équipe actuelle */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-[var(--color-muted)]">
          Ton équipe · {team.length}/{maxRoster}
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {team.map((h) => (
            <TeamSlot
              key={h.id}
              hero={h}
              {...(team.length > 1 ? { onDismiss: () => onDismiss(h) } : {})}
              dismissing={dismiss.isPending}
            />
          ))}
          {Array.from({ length: emptySlots }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="flex aspect-[3/4] flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-edge)] bg-black/20 text-center text-[10px] text-[var(--color-muted)]/50"
            >
              <span className="text-lg">＋</span>
              Libre
            </div>
          ))}
        </div>
      </div>

      {/* Recrues du jour */}
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[var(--color-muted)]">Recrues du jour 🌙</h3>
          <span className="chip bg-[var(--color-gold)]/15 text-[var(--color-gold-soft)]">
            💰 {cost} / recrue
          </span>
        </div>

        {full && (
          <p className="mb-2 text-xs text-[var(--color-ember)]">
            Effectif complet — renvoie un héros de ton équipe pour recruter.
          </p>
        )}

        {isLoading && <p className="text-[var(--color-muted)]">La taverne se remplit…</p>}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {(pool?.candidates ?? []).map((c) => (
            <CandidateCard
              key={c.slot}
              candidate={c}
              cost={cost}
              canAfford={gold >= cost}
              full={full}
              busy={recruit.isPending}
              onRecruit={() => onRecruit(c.slot)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function TeamSlot({
  hero,
  onDismiss,
  dismissing,
}: {
  hero: HeroView;
  onDismiss?: () => void;
  dismissing: boolean;
}) {
  const meta = classMeta(hero.classId);
  const grade = GRADE_META[hero.grade];
  return (
    <div className="panel flex flex-col items-center gap-1 p-2.5 text-center">
      <div className="flex w-full items-center justify-between">
        <span
          className="rounded px-1 text-[10px] font-bold"
          style={{ color: grade.color, boxShadow: `inset 0 0 0 1px ${grade.color}66` }}
        >
          {hero.grade}
        </span>
        <span className="text-[9px] text-[var(--color-muted)]">N.{hero.level}</span>
      </div>
      <span className="text-2xl">{meta.icon}</span>
      <span className="w-full truncate text-xs font-medium text-[var(--color-ink)]">
        {hero.name}
      </span>
      <span className="text-[9px] text-[var(--color-muted)]">{hero.className}</span>
      {onDismiss ? (
        <button
          onClick={onDismiss}
          disabled={dismissing}
          className="mt-1 w-full rounded border border-[var(--color-edge)] py-0.5 text-[10px] text-[var(--color-muted)] transition hover:border-[var(--color-ember)]/60 hover:text-[var(--color-ember)] disabled:opacity-40"
        >
          🚪 Renvoyer
        </button>
      ) : (
        <span className="mt-1 text-[9px] text-[var(--color-muted)]/40">Dernier héros</span>
      )}
    </div>
  );
}

function CandidateCard({
  candidate,
  cost,
  canAfford,
  full,
  busy,
  onRecruit,
}: {
  candidate: TavernCandidate;
  cost: number;
  canAfford: boolean;
  full: boolean;
  busy: boolean;
  onRecruit: () => void;
}) {
  const meta = classMeta(candidate.class_id);
  const grade = GRADE_META[candidate.grade];
  const disabled = candidate.claimed || full || !canAfford || busy;

  return (
    <div
      className={`panel flex flex-col gap-1.5 p-3 transition ${
        candidate.claimed ? 'opacity-45' : ''
      }`}
      style={
        candidate.claimed ? undefined : { boxShadow: `0 0 20px -14px ${grade.color}` }
      }
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <span className="text-lg">{meta.icon}</span>
          <span className="min-w-0 truncate text-sm font-semibold text-[var(--color-ink)]">
            {candidate.name}
          </span>
        </span>
        <span
          className="shrink-0 rounded px-1.5 font-display text-xs font-bold"
          style={{ color: grade.color, boxShadow: `inset 0 0 0 1px ${grade.color}66` }}
          title={`Grade ${candidate.grade}`}
        >
          {candidate.grade}
        </span>
      </div>

      <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
        {candidate.class_name}
      </div>

      <div className="grid grid-cols-4 gap-1 text-center text-[10px]">
        <Stat label="PV" value={candidate.stats.hp} />
        <Stat label="ATK" value={candidate.stats.atk} />
        <Stat label="DEF" value={candidate.stats.def} />
        <Stat label="VIT" value={candidate.stats.speed} />
      </div>

      {candidate.claimed ? (
        <div className="mt-1 rounded-lg bg-emerald-500/10 py-1.5 text-center text-[11px] font-medium text-emerald-300">
          ✓ Engagé
        </div>
      ) : (
        <button
          onClick={onRecruit}
          disabled={disabled}
          className="btn btn-primary mt-1 py-1.5 text-xs disabled:opacity-40"
          title={full ? 'Effectif complet' : !canAfford ? 'Or insuffisant' : `Recruter (${cost} or)`}
        >
          {busy ? '…' : `Recruter · 💰 ${cost}`}
        </button>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded bg-black/25 py-1">
      <div className="text-[8px] uppercase tracking-widest text-[var(--color-muted)]">{label}</div>
      <div className="font-semibold text-[var(--color-ink)]">{value}</div>
    </div>
  );
}
