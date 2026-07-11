import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useProfile } from '@/hooks/useProfile';
import { GRADE_META, recruitGradeOdds, type Grade } from '@shared/progression/recruit';
import { useHeroes, type HeroView } from './useHeroes';
import { useRecruit, useTavernPool, type TavernCandidate } from './useRecruit';
import { SyntyGlyph } from '@/components/synty/SyntyIcon';
import { classMeta } from '@/lib/gameUi';
import { classWeaponCleanUrl, syntyUrl, STAT_GLYPH } from '@/lib/synty';
import { UiIcon } from '@/components/synty/GameIcons';
import { BackToVillage } from '@/components/BackToVillage';
import { useMarkTavernSeen } from '@/hooks/useActionAlerts';

const STAT_TINT: Record<'hp' | 'atk' | 'def' | 'speed', string> = {
  hp: '#fb7185',
  atk: '#f5b544',
  def: '#56b6f4',
  speed: '#5fd39b',
};

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
  useMarkTavernSeen();
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
  const qualityBonus = pool?.quality_bonus ?? 0;
  const zonesDone = pool?.zones_completed ?? 0;
  const full = team.length >= maxRoster;
  const emptySlots = Math.max(0, maxRoster - team.length);

  // Onboarding : tant que le joueur n'a pas reconstitué un trio (< 3 héros), on le
  // guide et on ne montre que les 2 recrues imposées (archer + soigneur).
  const guided = team.length < 3;
  const allCandidates = pool?.candidates ?? [];
  const candidates = guided ? allCandidates.slice(0, 2) : allCandidates;

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
      <BackToVillage />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="heading flex items-center gap-2 text-2xl">
            <SyntyGlyph src={syntyUrl.map('Tavern01')} size={26} color="var(--color-gold-soft)" />
            Taverne
          </h2>
          <p className="text-sm text-[var(--color-muted)]">
            Choisis tes recrues du jour. Renouvelées à minuit (dans {countdown}).
          </p>
        </div>
        <Link to="/village" className="btn btn-ghost text-xs">
          ← Village
        </Link>
      </div>

      {feedback && <p className="text-sm text-[var(--color-ember)]">{feedback}</p>}

      {guided && (
        <div className="panel flex items-start gap-3 border-l-2 border-[var(--color-arcane)] p-4">
          <UiIcon name="tavern" size={22} color="var(--color-gold-soft)" />
          <div>
            <div className="font-display font-semibold text-[var(--color-ink)]">
              Renforce ton escouade
            </div>
            <p className="mt-0.5 text-sm text-[var(--color-muted)]">
              Un guerrier seul ne suffit pas : recrute un <strong>archer</strong> et un{' '}
              <strong>soigneur</strong> (les deux recrues ci-dessous, {cost} or chacun). Clique{' '}
              <strong>Recruter</strong> sur chacun pour reconstituer un trio solide.
            </p>
          </div>
        </div>
      )}

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
              className="flex min-h-[6.5rem] flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-edge)] bg-black/20 text-center text-[10px] text-[var(--color-muted)]/50"
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
          <h3 className="text-sm font-semibold text-[var(--color-muted)]">Recrues du jour</h3>
          <div className="flex flex-wrap items-center gap-2">
            {qualityBonus > 0 && (
              <span
                className="chip inline-flex items-center gap-1 bg-[var(--color-arcane)]/15 text-[var(--color-arcane)]"
                title={`Bonus de qualité des recrues (+${Math.round(qualityBonus * 100)} %) grâce à ${zonesDone} zone(s) terminée(s). Plus tu progresses, meilleures sont les recrues.`}
              >
                <UiIcon name="levelUp" size={12} /> Qualité +{Math.round(qualityBonus * 100)} %
              </span>
            )}
            <span className="chip inline-flex items-center gap-1 bg-[var(--color-gold)]/15 text-[var(--color-gold-soft)]">
              <UiIcon name="gold" size={12} /> {cost} / recrue
            </span>
          </div>
        </div>

        <GradeOdds qualityBonus={qualityBonus} />

        {full && (
          <p className="mb-2 text-xs text-[var(--color-ember)]">
            Effectif complet — renvoie un héros de ton équipe pour recruter.
          </p>
        )}

        {isLoading && <p className="text-[var(--color-muted)]">La taverne se remplit…</p>}

        <div data-tour="tavern-recruits" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {candidates.map((c) => (
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

/** Légende des chances de grade d'une recrue (transparence type gacha). */
function GradeOdds({ qualityBonus }: { qualityBonus: number }) {
  const order: Grade[] = ['S', 'A', 'B', 'C', 'D'];
  // Vraies chances, bonus de qualité pris en compte (Monte-Carlo mémoïsé).
  const odds = useMemo(() => recruitGradeOdds(qualityBonus), [qualityBonus]);
  const fmt = (p: number) => (p < 1 ? p.toFixed(1) : p.toFixed(0));
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--color-muted)]">
      <span className="font-semibold uppercase tracking-wide text-[var(--color-muted)]/70">
        Chances de grade
      </span>
      {order.map((g) => (
        <span key={g} className="inline-flex items-center gap-1" title={`Grade ${g} : ${fmt(odds[g])} %`}>
          <span className="h-2 w-2 rounded-full" style={{ background: GRADE_META[g].color }} />
          <span className="font-semibold" style={{ color: GRADE_META[g].color }}>
            {g}
          </span>
          <span className="tabular-nums">{fmt(odds[g])}%</span>
        </span>
      ))}
      <span className="text-[10px] italic text-[var(--color-muted)]/60">
        {qualityBonus > 0
          ? `bonus de qualité +${Math.round(qualityBonus * 100)}% inclus`
          : 'améliorées en terminant des zones'}
      </span>
    </div>
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
  const grade = GRADE_META[hero.grade];
  return (
    <div
      className="panel flex flex-col items-center gap-1 p-2.5 text-center"
      style={{ boxShadow: `inset 0 0 0 1px ${grade.color}44, 0 0 18px -12px ${grade.color}` }}
    >
      <div className="flex w-full items-center justify-between">
        <span
          className="rounded px-1 text-[10px] font-bold"
          style={{ color: grade.color, boxShadow: `inset 0 0 0 1px ${grade.color}66` }}
        >
          {hero.grade}
        </span>
        <span className="text-[9px] text-[var(--color-muted)]">N.{hero.level}</span>
      </div>
      <SyntyGlyph
        src={classWeaponCleanUrl(hero.classId)}
        color={classMeta(hero.classId).accent}
        size={34}
      />
      <span className="w-full truncate text-xs font-medium text-[var(--color-ink)]">
        {hero.name}
      </span>
      <span className="text-[9px] text-[var(--color-muted)]">{hero.className}</span>
      {onDismiss ? (
        <button
          onClick={onDismiss}
          disabled={dismissing}
          className="mt-1 flex w-full items-center justify-center gap-1 rounded border border-[var(--color-edge)] py-0.5 text-[10px] text-[var(--color-muted)] transition hover:border-[var(--color-ember)]/60 hover:text-[var(--color-ember)] disabled:opacity-40"
        >
          <UiIcon name="leave" size={11} color="currentColor" /> Renvoyer
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
  const grade = GRADE_META[candidate.grade];
  const meta = classMeta(candidate.class_id);
  const disabled = candidate.claimed || full || !canAfford || busy;

  return (
    <div
      className={`panel panel-hover relative flex flex-col gap-1.5 overflow-hidden p-3 ${
        candidate.claimed ? 'opacity-45' : ''
      }`}
      style={{ boxShadow: `inset 0 0 0 1px ${grade.color}44` }}
    >
      {/* liseré de grade en haut (aplat) */}
      <div className="absolute inset-x-0 top-0 h-[2px]" style={{ background: grade.color }} />
      <div className="flex items-center justify-between">
        <span className="flex min-w-0 items-center gap-1.5">
          <SyntyGlyph src={classWeaponCleanUrl(candidate.class_id)} color={meta.accent} size={22} />
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
        <Stat label="PV" value={candidate.stats.hp} kind="hp" />
        <Stat label="ATK" value={candidate.stats.atk} kind="atk" />
        <Stat label="DEF" value={candidate.stats.def} kind="def" />
        <Stat label="VIT" value={candidate.stats.speed} kind="speed" />
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
          {busy ? (
            '…'
          ) : (
            <>
              Recruter · <UiIcon name="gold" size={12} /> {cost}
            </>
          )}
        </button>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  kind,
}: {
  label: string;
  value: number;
  kind: 'hp' | 'atk' | 'def' | 'speed';
}) {
  return (
    <div className="rounded bg-black/25 py-1">
      <div className="flex items-center justify-center gap-0.5 text-[8px] uppercase tracking-widest text-[var(--color-muted)]">
        <SyntyGlyph src={STAT_GLYPH[kind]} color={STAT_TINT[kind]} size={9} title={label} />
        {label}
      </div>
      <div className="font-semibold text-[var(--color-ink)]">{value}</div>
    </div>
  );
}
