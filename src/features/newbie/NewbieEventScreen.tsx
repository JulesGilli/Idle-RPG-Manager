import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useNewbieEvent } from './useNewbieEvent';
import {
  NEWBIE_OBJECTIVES,
  NEWBIE_MILESTONES,
  type NewbieObjectiveDef,
  type NewbieObjectiveKind,
  type NewbieReward,
  type NewbieObjectiveProgress,
} from '@shared/progression/newbieEvent';
import { UiIcon } from '@/components/synty/GameIcons';
import type { UiIconName } from '@/lib/synty';

/* ---------------------------------------------------------------- helpers -- */

/** Icône par famille d'objectif. */
const KIND_ICON: Record<NewbieObjectiveKind, UiIconName> = {
  zone: 'boss',
  dungeon: 'skull',
  expedition: 'map',
  pantin: 'attack',
  tower: 'power',
  guild: 'guild',
};

/** Récompense → texte court lisible. */
function describeReward(r: NewbieReward): string {
  switch (r.type) {
    case 'gold':
      return `${r.amount.toLocaleString('fr-FR')} or`;
    case 'account_xp':
      return `${r.amount.toLocaleString('fr-FR')} XP de compte`;
    case 'expedition_resources':
      return `${r.qty} ressources d'expédition`;
    case 'relic_choice':
      return `1 relique au choix (zone ${r.zone})`;
    case 'hero_s_choice':
      return '1 héros S au choix';
    case 'equipment_choice': {
      const what = r.slots.length === 2 ? 'arme ou armure' : r.slots[0] === 'weapon' ? 'arme' : 'armure';
      const where =
        r.zone != null
          ? `zone ${r.zone}`
          : r.zoneOffset === 0
            ? 'ta zone'
            : `zone +${r.zoneOffset}`;
      return `1 ${what} au choix (${where})`;
    }
  }
}

/** Compte à rebours live vers `endsAt` (ISO). */
function useCountdown(endsAt: string | undefined): string {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => tick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [endsAt]);
  if (!endsAt) return '';
  const ms = Date.parse(endsAt) - Date.now();
  if (ms <= 0) return 'Terminé';
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  if (d > 0) return `${d} j ${h} h`;
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h} h ${m} min`;
}

/* ----------------------------------------------------------------- écran --- */

export function NewbieEventScreen() {
  const { state } = useNewbieEvent();
  const data = state.data;
  const countdown = useCountdown(data?.event?.ends_at ?? undefined);

  if (state.isLoading) {
    return (
      <section className="anim-fade">
        <BackHome />
        <p className="mt-4 text-[var(--color-muted)]">Chargement de l'événement…</p>
      </section>
    );
  }

  if (!data?.eligible || !data.event) {
    return (
      <section className="anim-fade">
        <BackHome />
        <div className="panel mt-4 p-6 text-center">
          <h2 className="heading text-xl">Événement indisponible</h2>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            Le Parcours du Nouveau Venu est réservé aux comptes qui débutent leur aventure.
          </p>
        </div>
      </section>
    );
  }

  const progressById = new Map((data.objectives ?? []).map((p) => [p.id, p]));
  const pct = data.pct ?? 0;
  const reached = new Set(data.milestones_reached ?? []);
  const ended = data.active === false;

  return (
    <section className="anim-fade space-y-5">
      <BackHome />

      {/* Bandeau */}
      <div className="panel relative overflow-hidden">
        <NewbieBanner />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-panel)] via-[var(--color-panel)]/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
          <h2 className="heading flex flex-wrap items-center gap-2 text-2xl">
            <GiftGlyph size={26} />
            Parcours du Nouveau Venu
          </h2>
          <p className="mt-1 max-w-xl text-sm text-[var(--color-muted)]">
            Tes 7 premiers jours d'aventure. Accomplis les objectifs pour récupérer de quoi
            progresser vite — et remplis la jauge pour un héros S de ton choix.
          </p>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-gold)]/30 bg-[var(--color-gold)]/10 px-2.5 py-1 text-xs font-semibold text-[var(--color-gold-soft)]">
            <UiIcon name="loop" size={13} color="currentColor" />
            {ended ? 'Événement terminé' : `Temps restant : ${countdown}`}
          </div>
        </div>
      </div>

      {/* Barre globale + paliers */}
      <div className="panel p-4 sm:p-5">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="font-display text-sm font-bold text-[var(--color-ink)]">
            Progression globale
          </span>
          <span className="font-display text-lg font-bold text-[var(--color-gold-soft)]">{pct}%</span>
        </div>
        <MilestoneBar pct={pct} reached={reached} />
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {NEWBIE_MILESTONES.map((m) => {
            const hit = reached.has(m.pct);
            return (
              <div
                key={m.pct}
                className={`rounded-lg border p-2.5 text-center transition ${
                  hit
                    ? 'border-[var(--color-gold)]/50 bg-[var(--color-gold)]/10'
                    : 'border-[var(--color-edge)] bg-black/20'
                }`}
              >
                <div className="flex items-center justify-center gap-1 text-[11px] font-bold uppercase tracking-wide text-[var(--color-muted)]">
                  {hit && <UiIcon name="victory" size={12} />} {m.pct}%
                </div>
                <div
                  className={`mt-1 text-[11px] leading-snug ${
                    hit ? 'text-[var(--color-gold-soft)]' : 'text-[var(--color-muted)]'
                  }`}
                >
                  {m.rewards.map(describeReward).join(' + ')}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-center text-[10px] text-[var(--color-muted)]/70">
          Les récompenses seront réclamables très bientôt.
        </p>
      </div>

      {/* Objectifs */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--color-muted)]">
          Objectifs
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {NEWBIE_OBJECTIVES.map((def) => (
            <ObjectiveCard key={def.id} def={def} progress={progressById.get(def.id)} />
          ))}
        </div>
      </div>
    </section>
  );
}

function BackHome() {
  return (
    <Link
      to="/"
      className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-[var(--color-edge)] px-3 py-1.5 text-xs font-medium text-[var(--color-muted)] transition hover:border-[var(--color-edge-strong)] hover:text-[var(--color-ink)]"
    >
      ← Retour
    </Link>
  );
}

/** Une carte d'objectif : icône, libellé, description, récompense, état. */
function ObjectiveCard({
  def,
  progress,
}: {
  def: NewbieObjectiveDef;
  progress: NewbieObjectiveProgress | undefined;
}) {
  const done = progress?.done ?? false;
  const current = progress?.current ?? 0;
  const target = progress?.target ?? 1;
  const showGauge = target > 1 && !done;

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border p-3 transition ${
        done
          ? 'border-[var(--color-gold-soft)]/50 bg-[var(--color-gold-soft)]/[0.07]'
          : 'border-[var(--color-edge)] bg-white/[0.02]'
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          done ? 'bg-[var(--color-gold-soft)]/20' : 'bg-white/5'
        }`}
      >
        <UiIcon
          name={KIND_ICON[def.kind]}
          size={18}
          color={done ? 'var(--color-gold-soft)' : 'var(--color-muted)'}
        />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-[var(--color-ink)]">{def.label}</span>
          {done && <UiIcon name="victory" size={14} color="var(--color-gold-soft)" />}
        </div>
        <p className="mt-0.5 text-[11px] leading-tight text-[var(--color-muted)]">{def.desc}</p>

        {showGauge && (
          <div className="mt-1.5 flex items-center gap-2">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/40">
              <span
                className="block h-full rounded-full bg-[var(--color-arcane)] transition-all"
                style={{ width: `${Math.round((current / target) * 100)}%` }}
              />
            </span>
            <span className="shrink-0 text-[10px] tabular-nums text-[var(--color-muted)]">
              {current}/{target}
            </span>
          </div>
        )}

        <div className="mt-1.5 flex flex-wrap gap-1">
          {def.rewards.map((r, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--color-gold)]/25 bg-[var(--color-gold)]/[0.08] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-gold-soft)]"
            >
              <GiftGlyph size={10} /> {describeReward(r)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Barre de progression avec repères de paliers. */
function MilestoneBar({ pct, reached }: { pct: number; reached: Set<number> }) {
  return (
    <div className="relative h-3 w-full rounded-full bg-black/40">
      <div
        className="h-full rounded-full bg-gradient-to-r from-[var(--color-gold)] to-[var(--color-gold-soft)] transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
      {NEWBIE_MILESTONES.map((m) => (
        <span
          key={m.pct}
          className={`absolute top-1/2 h-3 w-0.5 -translate-y-1/2 ${
            reached.has(m.pct) ? 'bg-white/80' : 'bg-white/25'
          }`}
          style={{ left: `${m.pct}%` }}
          title={`${m.pct}%`}
        />
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- visuels --- */

/** Petite icône cadeau (aucune icône « gift » dans le set du jeu). */
function GiftGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden className="shrink-0">
      <path d="M20 12v8H4v-8" stroke="var(--color-gold-soft)" strokeWidth="2" strokeLinecap="round" />
      <path d="M2 8h20v4H2z" fill="var(--color-gold-soft)" opacity="0.25" />
      <path d="M2 8h20v4H2z" stroke="var(--color-gold-soft)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 8v12" stroke="var(--color-gold-soft)" strokeWidth="2" />
      <path
        d="M12 8S9.5 8 8.5 6.5 8 3.5 9.5 3.5 12 8 12 8zm0 0s2.5 0 3.5-1.5S16 3.5 14.5 3.5 12 8 12 8z"
        stroke="var(--color-gold-soft)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Bandeau décoratif : lueur dorée + confettis. */
function NewbieBanner() {
  return (
    <svg viewBox="0 0 1200 240" className="h-36 w-full sm:h-44" preserveAspectRatio="xMidYMid slice" role="img" aria-label="">
      <defs>
        <radialGradient id="nb-glow" cx="0.5" cy="0.75" r="0.7">
          <stop offset="0%" stopColor="#ffd27a" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#ffd27a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="nb-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1b1524" />
          <stop offset="100%" stopColor="#241a14" />
        </linearGradient>
      </defs>
      <rect width="1200" height="240" fill="url(#nb-bg)" />
      <ellipse cx="600" cy="240" rx="620" ry="200" fill="url(#nb-glow)" />
      {[
        [120, 60, '#ffd27a'], [260, 40, '#7c6cff'], [400, 80, '#fb7185'], [540, 50, '#ffd27a'],
        [700, 70, '#5fd39b'], [860, 45, '#7c6cff'], [1000, 65, '#ffd27a'], [1120, 50, '#fb7185'],
        [200, 120, '#5fd39b'], [980, 130, '#fb7185'], [640, 30, '#7c6cff'],
      ].map(([x, y, c], i) => (
        <rect
          key={i}
          x={x as number}
          y={y as number}
          width={7}
          height={11}
          rx={1.5}
          fill={c as string}
          opacity={0.7}
          transform={`rotate(${(i * 47) % 90} ${x as number} ${y as number})`}
        />
      ))}
    </svg>
  );
}
