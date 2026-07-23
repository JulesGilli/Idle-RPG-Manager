import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useNewbieEvent, type NewbieChoice } from './useNewbieEvent';
import {
  NEWBIE_MILESTONES,
  newbieObjectivesForArc,
  newbieMilestonesForArc,
  rewardChoice,
  resolveRewardZone,
  type NewbieObjectiveDef,
  type NewbieObjectiveKind,
  type NewbieReward,
  type NewbieMilestone,
  type NewbieObjectiveProgress,
} from '@shared/progression/newbieEvent';
import { FORGE_BASES } from '@shared/progression/forge';
import { RELIC_BASES } from '@shared/progression/relic';
import { UiIcon, ClassIcon } from '@/components/synty/GameIcons';
import { BodyPortal } from '@/components/BodyPortal';
import { classMeta } from '@/lib/gameUi';
import type { UiIconName } from '@/lib/synty';

/* ---------------------------------------------------------------- helpers -- */

const KIND_ICON: Record<NewbieObjectiveKind, UiIconName> = {
  zone: 'boss',
  dungeon: 'skull',
  expedition: 'map',
  pantin: 'attack',
  tower: 'power',
  guild: 'guild',
};

/** Les 8 classes jouables (pour le choix du héros S). */
const ALL_CLASSES = ['guerrier', 'archer', 'mage', 'paladin', 'soigneur', 'voleur', 'necromancien', 'inquisiteur'];

/** Habillage de l'écran selon l'arc cible (titre, accroche, teinte de bannière). */
const ARC_THEME: Record<number, { title: string; subtitle: string; region: string; accent: string }> = {
  1: {
    title: 'Parcours du Nouveau Venu',
    subtitle:
      "Tes 7 premiers jours d'aventure. Accomplis les objectifs pour récupérer de quoi progresser vite — et remplis la jauge pour un héros S de ton choix.",
    region: 'Royaumes du Seuil',
    accent: '#8b5cf6',
  },
  2: {
    title: 'Parcours des Terres du Désespoir',
    subtitle:
      "Tes 7 premiers jours dans l'Arc 2. Les mêmes défis, mais aux Terres du Désespoir : récompenses forgées en Tier 2 et butin à l'échelle de l'arc — jusqu'au héros S.",
    region: 'Terres du Désespoir',
    accent: '#e0484d',
  },
};
function arcTheme(arc: number) {
  return ARC_THEME[arc] ?? ARC_THEME[1]!;
}

function describeReward(r: NewbieReward, furthest = 1): string {
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
      const zone = resolveRewardZone(r, furthest);
      return `1 ${what} au choix (zone ${zone})`;
    }
  }
}

/** La récompense « à choisir » d'une liste (au plus une dans la config). */
function choiceRewardOf(rewards: NewbieReward[]): NewbieReward | null {
  return rewards.find((r) => rewardChoice(r) !== null) ?? null;
}

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

/** Cible de réclamation en attente d'un choix (ouvre un sélecteur). */
type PendingClaim =
  | { scope: 'objective'; id: string; reward: NewbieReward }
  | { scope: 'milestone'; pct: number; reward: NewbieReward };

export function NewbieEventScreen() {
  const { state, claimObjective, claimMilestone } = useNewbieEvent();
  const data = state.data;
  const countdown = useCountdown(data?.event?.ends_at ?? undefined);
  const [pending, setPending] = useState<PendingClaim | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const arc = data.arc ?? 1;
  const theme = arcTheme(arc);
  const objectiveDefs = newbieObjectivesForArc(arc);
  const milestoneDefs = newbieMilestonesForArc(arc);
  const furthest = data.furthest_zone ?? 1;
  const progressById = new Map((data.objectives ?? []).map((p) => [p.id, p]));
  const claimedObj = new Set(data.claimed_objectives ?? []);
  const claimedMs = new Set(data.claimed_milestones ?? []);
  const pct = data.pct ?? 0;
  const reached = new Set(data.milestones_reached ?? []);
  const active = data.active !== false;
  const busy = claimObjective.isPending || claimMilestone.isPending;
  const doneCount = (data.objectives ?? []).filter((p) => p.done).length;
  const totalRewards = objectiveDefs.length + milestoneDefs.length;
  const claimedCount = claimedObj.size + claimedMs.size;

  // Lance la réclamation : directe si pas de choix, sinon ouvre le sélecteur.
  const startObjectiveClaim = (def: NewbieObjectiveDef) => {
    setError(null);
    const choiceReward = choiceRewardOf(def.rewards);
    if (choiceReward) {
      setPending({ scope: 'objective', id: def.id, reward: choiceReward });
      return;
    }
    claimObjective.mutate({ objectiveId: def.id }, { onError: (e) => setError(e.message) });
  };
  const startMilestoneClaim = (m: NewbieMilestone) => {
    setError(null);
    const choiceReward = choiceRewardOf(m.rewards);
    if (choiceReward) {
      setPending({ scope: 'milestone', pct: m.pct, reward: choiceReward });
      return;
    }
    claimMilestone.mutate({ pct: m.pct }, { onError: (e) => setError(e.message) });
  };
  // Confirme un choix depuis un sélecteur.
  const confirmChoice = (choice: NewbieChoice) => {
    if (!pending) return;
    const onDone = { onSuccess: () => setPending(null), onError: (e: Error) => setError(e.message) };
    if (pending.scope === 'objective') claimObjective.mutate({ objectiveId: pending.id, choice }, onDone);
    else claimMilestone.mutate({ pct: pending.pct, choice }, onDone);
  };

  return (
    <section className="anim-fade space-y-5">
      <BackHome />

      {/* Bandeau */}
      <div className="panel relative overflow-hidden">
        <NewbieBanner accent={theme.accent} />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-panel)] via-[var(--color-panel)]/55 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]"
            style={{ color: theme.accent, borderColor: `${theme.accent}66`, backgroundColor: `${theme.accent}1f` }}
          >
            <UiIcon name="map" size={11} color="currentColor" /> {theme.region}
          </span>
          <h2 className="heading mt-1.5 flex flex-wrap items-center gap-2 text-2xl sm:text-3xl">
            <GiftGlyph size={28} />
            {theme.title}
          </h2>
          <p className="mt-1 max-w-xl text-sm text-[var(--color-muted)]">{theme.subtitle}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                active
                  ? 'border-[var(--color-gold)]/30 bg-[var(--color-gold)]/10 text-[var(--color-gold-soft)]'
                  : 'border-[var(--color-edge)] bg-black/30 text-[var(--color-muted)]'
              }`}
            >
              <UiIcon name="loop" size={13} color="currentColor" />
              {active ? `Temps restant : ${countdown}` : 'Événement terminé'}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-edge)] bg-black/30 px-2.5 py-1 text-xs font-semibold text-[var(--color-ink)]">
              <GiftGlyph size={12} /> {claimedCount}/{totalRewards} récompenses
            </span>
          </div>
        </div>
      </div>

      {error && <p className="rounded-lg border border-[var(--color-ember)]/40 bg-[var(--color-ember)]/10 px-3 py-2 text-sm text-[var(--color-ember)]">{error}</p>}

      {/* Barre globale + paliers */}
      <div className="panel p-4 sm:p-5">
        <div className="mb-1 flex items-end justify-between">
          <div>
            <div className="font-display text-sm font-bold text-[var(--color-ink)]">Progression globale</div>
            <div className="text-[11px] text-[var(--color-muted)]">{doneCount}/{objectiveDefs.length} objectifs accomplis</div>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="font-display text-3xl font-black leading-none text-[var(--color-gold-soft)]">{pct}</span>
            <span className="font-display text-lg font-bold text-[var(--color-gold-soft)]/70">%</span>
          </div>
        </div>
        <MilestoneBar pct={pct} reached={reached} claimedMs={claimedMs} />
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {milestoneDefs.map((m) => {
            const hit = reached.has(m.pct);
            const claimed = claimedMs.has(m.pct);
            const canClaim = hit && !claimed;
            return (
              <div
                key={m.pct}
                className={`relative flex flex-col overflow-hidden rounded-xl border p-3 text-center transition ${
                  claimed
                    ? 'border-[var(--color-gold-soft)]/40 bg-[var(--color-gold-soft)]/[0.08]'
                    : canClaim
                      ? 'border-[var(--color-gold)]/70 bg-[var(--color-gold)]/[0.14] shadow-[0_0_18px_-6px_var(--color-gold)]'
                      : hit
                        ? 'border-[var(--color-gold)]/40 bg-[var(--color-gold)]/[0.08]'
                        : 'border-[var(--color-edge)] bg-black/20 opacity-70'
                }`}
              >
                {canClaim && <span className="anim-pulse pointer-events-none absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[var(--color-gold)]" />}
                <div className="flex items-center justify-center gap-1 font-display text-sm font-black text-[var(--color-ink)]">
                  {!hit && <UiIcon name="lock" size={11} color="var(--color-muted)" />}
                  {claimed && <UiIcon name="victory" size={12} color="var(--color-gold-soft)" />}
                  {m.pct}%
                </div>
                <div className={`mt-1 flex-1 text-[11px] leading-snug ${hit ? 'text-[var(--color-gold-soft)]' : 'text-[var(--color-muted)]'}`}>
                  {m.rewards.map((r) => describeReward(r, furthest)).join(' + ')}
                </div>
                {hit && (
                  <ClaimButton
                    claimed={claimed}
                    disabled={!active || busy}
                    onClick={() => startMilestoneClaim(m)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Objectifs */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--color-muted)]">Objectifs</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {objectiveDefs.map((def) => (
            <ObjectiveCard
              key={def.id}
              def={def}
              progress={progressById.get(def.id)}
              claimed={claimedObj.has(def.id)}
              furthest={furthest}
              active={active}
              busy={busy}
              onClaim={() => startObjectiveClaim(def)}
            />
          ))}
        </div>
      </div>

      {/* Sélecteurs de récompense */}
      {pending && pending.reward.type === 'equipment_choice' && (
        <EquipmentPicker
          slots={pending.reward.slots}
          zone={resolveRewardZone(pending.reward, furthest) ?? 1}
          busy={busy}
          onClose={() => setPending(null)}
          onPick={(base_id) => confirmChoice({ base_id })}
        />
      )}
      {pending && pending.reward.type === 'relic_choice' && (
        <RelicPicker
          zone={resolveRewardZone(pending.reward, furthest) ?? 1}
          busy={busy}
          onClose={() => setPending(null)}
          onPick={(relic_base_id) => confirmChoice({ relic_base_id })}
        />
      )}
      {pending && pending.reward.type === 'hero_s_choice' && (
        <ClassPicker busy={busy} onClose={() => setPending(null)} onPick={(class_id) => confirmChoice({ class_id })} />
      )}
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

/** Bouton de réclamation compact, partagé objectifs/paliers. */
function ClaimButton({ claimed, disabled, onClick }: { claimed: boolean; disabled: boolean; onClick: () => void }) {
  if (claimed) {
    return (
      <span className="mt-1.5 inline-flex items-center justify-center gap-1 rounded-md bg-[var(--color-gold-soft)]/15 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--color-gold-soft)]">
        <UiIcon name="victory" size={11} color="currentColor" /> Réclamé
      </span>
    );
  }
  return (
    <button onClick={onClick} disabled={disabled} className="btn btn-primary mt-1.5 py-1 text-[11px] disabled:opacity-40">
      Réclamer
    </button>
  );
}

function ObjectiveCard({
  def,
  progress,
  claimed,
  furthest,
  active,
  busy,
  onClaim,
}: {
  def: NewbieObjectiveDef;
  progress: NewbieObjectiveProgress | undefined;
  claimed: boolean;
  furthest: number;
  active: boolean;
  busy: boolean;
  onClaim: () => void;
}) {
  const done = progress?.done ?? false;
  const current = progress?.current ?? 0;
  const target = progress?.target ?? 1;
  const showGauge = target > 1 && !done;
  const canClaim = done && !claimed;

  return (
    <div
      className={`relative flex items-start gap-3 overflow-hidden rounded-xl border p-3 transition ${
        canClaim
          ? 'border-[var(--color-gold)]/60 bg-[var(--color-gold)]/[0.09] shadow-[0_0_16px_-8px_var(--color-gold)]'
          : done
            ? 'border-[var(--color-gold-soft)]/40 bg-[var(--color-gold-soft)]/[0.06]'
            : 'border-[var(--color-edge)] bg-white/[0.02]'
      }`}
    >
      {canClaim && <span className="anim-pulse pointer-events-none absolute right-2 top-2 h-2 w-2 rounded-full bg-[var(--color-gold)]" />}
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${done ? 'bg-[var(--color-gold-soft)]/20' : 'bg-white/5'}`}>
        <UiIcon name={KIND_ICON[def.kind]} size={18} color={done ? 'var(--color-gold-soft)' : 'var(--color-muted)'} />
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
              <span className="block h-full rounded-full bg-[var(--color-arcane)] transition-all" style={{ width: `${Math.round((current / target) * 100)}%` }} />
            </span>
            <span className="shrink-0 text-[10px] tabular-nums text-[var(--color-muted)]">{current}/{target}</span>
          </div>
        )}

        <div className="mt-1.5 flex flex-wrap gap-1">
          {def.rewards.map((r, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-md border border-[var(--color-gold)]/25 bg-[var(--color-gold)]/[0.08] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-gold-soft)]">
              <GiftGlyph size={10} /> {describeReward(r, furthest)}
            </span>
          ))}
        </div>

        {done && (
          <div className="mt-2">
            {claimed ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[var(--color-gold-soft)]">
                <UiIcon name="victory" size={11} color="currentColor" /> Réclamé
              </span>
            ) : (
              <button onClick={onClaim} disabled={!active || busy} className="btn btn-primary py-1 text-[11px] disabled:opacity-40">
                {choiceRewardOf(def.rewards) ? 'Choisir ma récompense' : 'Réclamer'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MilestoneBar({ pct, reached, claimedMs }: { pct: number; reached: Set<number>; claimedMs: Set<number> }) {
  return (
    <div className="relative mt-2 h-4 w-full rounded-full bg-black/50 shadow-[inset_0_1px_3px_rgba(0,0,0,0.6)]">
      <div
        className="relative h-full rounded-full bg-gradient-to-r from-[var(--color-gold)] to-[var(--color-gold-soft)] shadow-[0_0_12px_-2px_var(--color-gold)] transition-all duration-700"
        style={{ width: `${pct}%` }}
      >
        <span className="absolute inset-0 rounded-full bg-gradient-to-b from-white/30 to-transparent" />
      </div>
      {NEWBIE_MILESTONES.map((m) => {
        const hit = reached.has(m.pct);
        const claimed = claimedMs.has(m.pct);
        return (
          <span
            key={m.pct}
            className={`absolute top-1/2 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 transition ${
              claimed
                ? 'border-[var(--color-gold-soft)] bg-[var(--color-gold-soft)] text-black'
                : hit
                  ? 'border-[var(--color-gold-soft)] bg-[var(--color-panel)] text-[var(--color-gold-soft)]'
                  : 'border-[var(--color-edge-strong)] bg-[var(--color-panel)] text-transparent'
            }`}
            style={{ left: `${m.pct}%` }}
            title={`${m.pct}%`}
          >
            {claimed ? (
              <UiIcon name="victory" size={10} color="currentColor" />
            ) : (
              <span className={`h-1.5 w-1.5 rounded-full ${hit ? 'bg-[var(--color-gold-soft)]' : 'bg-[var(--color-edge-strong)]'}`} />
            )}
          </span>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------- pickers -- */

function PickerShell({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: ReactNode }) {
  return (
    <BodyPortal>
      <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
        <div className="panel anim-pop max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
          <div className="mb-1 flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold text-[var(--color-ink)]">{title}</h3>
            <button onClick={onClose} className="text-[var(--color-muted)] hover:text-[var(--color-ink)]">✕</button>
          </div>
          <p className="mb-4 text-xs text-[var(--color-muted)]">{subtitle}</p>
          {children}
        </div>
      </div>
    </BodyPortal>
  );
}

function EquipmentPicker({
  slots,
  zone,
  busy,
  onPick,
  onClose,
}: {
  slots: ('weapon' | 'armor')[];
  zone: number;
  busy: boolean;
  onPick: (baseId: string) => void;
  onClose: () => void;
}) {
  const bases = FORGE_BASES.filter((b) => slots.includes(b.itemType));
  return (
    <PickerShell
      title="Choisis ton équipement"
      subtitle={`Modèle au choix, forgé en Ultime à la zone ${zone}.`}
      onClose={onClose}
    >
      <div className="grid grid-cols-2 gap-2">
        {bases.map((b) => (
          <button
            key={b.id}
            onClick={() => onPick(b.id)}
            disabled={busy}
            className="flex items-center gap-2 rounded-lg border border-[var(--color-edge)] bg-black/20 p-2.5 text-left transition hover:border-[var(--color-gold-soft)]/50 disabled:opacity-40"
          >
            <span className="text-xl">{b.icon}</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-[var(--color-ink)]">{b.label}</span>
              <span className="block text-[10px] text-[var(--color-muted)]">{b.itemType === 'weapon' ? 'Arme' : 'Armure'}</span>
            </span>
          </button>
        ))}
      </div>
    </PickerShell>
  );
}

function RelicPicker({ zone, busy, onPick, onClose }: { zone: number; busy: boolean; onPick: (id: string) => void; onClose: () => void }) {
  return (
    <PickerShell title="Choisis ta relique" subtitle={`Relique au choix, forgée en Ultime à la zone ${zone}.`} onClose={onClose}>
      <div className="space-y-2">
        {RELIC_BASES.map((b) => (
          <button
            key={b.id}
            onClick={() => onPick(b.id)}
            disabled={busy}
            className="flex w-full items-center gap-2 rounded-lg border border-[var(--color-edge)] bg-black/20 p-2.5 text-left transition hover:border-[var(--color-gold-soft)]/50 disabled:opacity-40"
          >
            <span className="text-xl">{b.icon}</span>
            <span className="text-sm font-semibold text-[var(--color-ink)]">{b.label}</span>
          </button>
        ))}
      </div>
    </PickerShell>
  );
}

function ClassPicker({ busy, onPick, onClose }: { busy: boolean; onPick: (classId: string) => void; onClose: () => void }) {
  return (
    <PickerShell
      title="Choisis ton héros S"
      subtitle="Un héros de grade S garanti, dans la classe de ton choix. Il rejoint directement ton effectif."
      onClose={onClose}
    >
      <div className="grid grid-cols-2 gap-2">
        {ALL_CLASSES.map((id) => {
          const meta = classMeta(id);
          return (
            <button
              key={id}
              onClick={() => onPick(id)}
              disabled={busy}
              className="flex items-center gap-2 rounded-lg border border-[var(--color-edge)] bg-black/20 p-2.5 text-left transition hover:border-[var(--color-gold-soft)]/50 disabled:opacity-40"
            >
              <ClassIcon classId={id} size={22} />
              <span className="text-sm font-semibold" style={{ color: meta.accent }}>{meta.label}</span>
            </button>
          );
        })}
      </div>
    </PickerShell>
  );
}

/* --------------------------------------------------------------- visuels --- */

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

function NewbieBanner({ accent = '#ffd27a' }: { accent?: string }) {
  const gold = '#ffd27a';
  return (
    <svg viewBox="0 0 1200 260" className="h-40 w-full sm:h-52" preserveAspectRatio="xMidYMid slice" role="img" aria-label="">
      <defs>
        <linearGradient id="nb-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0f0b17" />
          <stop offset="55%" stopColor="#171021" />
          <stop offset="100%" stopColor="#1d1420" />
        </linearGradient>
        <radialGradient id="nb-glow-a" cx="0.5" cy="1" r="0.9">
          <stop offset="0%" stopColor={accent} stopOpacity="0.5" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="nb-glow-b" cx="0.82" cy="0.4" r="0.55">
          <stop offset="0%" stopColor={gold} stopOpacity="0.4" />
          <stop offset="100%" stopColor={gold} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1200" height="260" fill="url(#nb-bg)" />
      <ellipse cx="560" cy="270" rx="680" ry="220" fill="url(#nb-glow-a)" />
      <circle cx="985" cy="105" r="230" fill="url(#nb-glow-b)" />

      {/* Rayons discrets derrière l'emblème */}
      <g opacity="0.15" stroke={gold} strokeWidth="2">
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i * Math.PI) / 6;
          return <line key={i} x1={985} y1={110} x2={985 + Math.cos(a) * 260} y2={110 + Math.sin(a) * 260} />;
        })}
      </g>

      {/* Emblème cadeau (fantôme) */}
      <g transform="translate(985 110)" opacity="0.9">
        <g transform="translate(-70 -70) scale(5.8)" fill="none" stroke={gold} strokeWidth="1.6" strokeLinejoin="round" opacity="0.5">
          <path d="M20 12v8H4v-8" strokeLinecap="round" />
          <path d="M2 8h20v4H2z" fill={gold} fillOpacity="0.12" />
          <path d="M12 8v12" />
          <path d="M12 8S9.5 8 8.5 6.5 8 3.5 9.5 3.5 12 8 12 8zm0 0s2.5 0 3.5-1.5S16 3.5 14.5 3.5 12 8 12 8z" />
        </g>
      </g>

      {/* Étoiles + confettis */}
      {[
        [120, 60, gold], [260, 44, accent], [420, 82, gold], [560, 52, accent],
        [700, 72, gold], [180, 130, accent], [330, 165, gold], [90, 96, accent],
        [640, 120, gold], [500, 150, accent],
      ].map(([x, y, c], i) => (
        <g key={i} transform={`translate(${x} ${y})`} opacity={0.85}>
          <path d="M0 -5 L1.3 -1.3 5 0 1.3 1.3 0 5 -1.3 1.3 -5 0 -1.3 -1.3 Z" fill={c as string} />
        </g>
      ))}
      {[
        [230, 90, accent], [470, 40, gold], [760, 150, accent], [150, 175, gold], [600, 78, accent],
      ].map(([x, y, c], i) => (
        <rect key={`c${i}`} x={x as number} y={y as number} width={6} height={10} rx={1.5} fill={c as string} opacity={0.7} transform={`rotate(${(i * 53) % 90} ${x as number} ${y as number})`} />
      ))}
    </svg>
  );
}
