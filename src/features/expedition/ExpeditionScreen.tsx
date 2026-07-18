import { useEffect, useState } from 'react';
import { useHeroes, type HeroView } from '@/features/heroes/useHeroes';
import {
  useHeroAvailability,
  heroIsBusy,
  HERO_STATUS_LABEL,
} from '@/features/heroes/useHeroAvailability';
import { resourceMeta } from '@/hooks/useResources';
import { classMeta } from '@/lib/gameUi';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { SyntyImg } from '@/components/synty/SyntyIcon';
import { UiIcon, ClassIcon } from '@/components/synty/GameIcons';
import { MAP_ART } from '@/lib/synty';
import { BackToActivities } from '@/components/BackToActivities';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useMarkExpeditionsSeen } from '@/hooks/useActionAlerts';
import {
  computeExpeditionDuration,
  expeditionRequiredPower,
  expeditionLevelInfo,
  expeditionMasteryBonus,
  MAX_EXPEDITION_LEVEL,
} from '@shared/progression/expedition';
import { useArc } from '@/features/arc/useArc';
import { useProfile } from '@/hooks/useProfile';
import {
  useExpeditionTypes,
  useActiveExpeditions,
  useExpeditionActions,
  type ExpeditionTypeRow,
  type ExpeditionRunRow,
  type ExpeditionRewards,
} from './useExpedition';
import { ExpeditionScene } from './ExpeditionScene';

const MAX_TEAM = 4;

// Atmosphère par destination : art de carte Synty (engravé, pleine couleur) + accent.
const EXP_META: Record<string, { art: string; accent: string }> = {
  exp_foret_fossile: { art: MAP_ART.monster, accent: '#5fd39b' },
  exp_ruines_englouties: { art: MAP_ART.skull, accent: '#56b6f4' },
  exp_mines_abyssales: { art: MAP_ART.dragon, accent: '#e0793c' },
};
const expMeta = (id: string) => EXP_META[id] ?? { art: MAP_ART.treasure, accent: '#f5b544' };
const dangerLevel = (minLevel: number) => Math.min(5, Math.max(1, Math.ceil(minLevel / 2)));

function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}

export function ExpeditionScreen() {
  useMarkExpeditionsSeen();
  const { data: types, isLoading } = useExpeditionTypes();
  const { data: runs } = useActiveExpeditions();
  const { data: heroes } = useHeroes();
  const availability = useHeroAvailability();
  const actions = useExpeditionActions();

  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rewards, setRewards] = useState<ExpeditionRewards | null>(null);
  // Abandon = perte sèche et IRRÉVERSIBLE (la ligne est supprimée côté serveur) :
  // on passe par une confirmation, jamais sur un simple clic.
  const [pendingCancel, setPendingCancel] = useState<ExpeditionRunRow | null>(null);

  const { currentArc } = useArc();
  const { data: profile } = useProfile();
  const mastery = expeditionLevelInfo(profile?.expedition_xp ?? 0);
  const heroList = heroes ?? [];
  const activeRuns = runs ?? [];
  const type = (types ?? []).find((t) => t.id === selectedType) ?? null;
  const teamPower = picked.reduce((s, id) => s + (heroList.find((h) => h.id === id)?.power ?? 0), 0);
  const powerOk = !type || teamPower >= expeditionRequiredPower(type, currentArc);
  const heroById = (id: string) => heroList.find((h) => h.id === id);

  function toggleHero(id: string) {
    if (heroIsBusy(availability.get(id))) return;
    setPicked((cur) =>
      cur.includes(id) ? cur.filter((h) => h !== id) : cur.length < MAX_TEAM ? [...cur, id] : cur,
    );
  }

  function launch() {
    if (!type || picked.length === 0) return;
    setError(null);
    actions.start.mutate(
      { expeditionTypeId: type.id, heroIds: picked },
      {
        onSuccess: () => {
          setPicked([]);
          setSelectedType(null);
        },
        onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
      },
    );
  }

  const cancelType = pendingCancel
    ? (types ?? []).find((t) => t.id === pendingCancel.expedition_type_id)
    : null;

  function confirmCancel() {
    if (!pendingCancel) return;
    setError(null);
    actions.cancel.mutate(pendingCancel.id, {
      onSuccess: () => setPendingCancel(null),
      onError: (e) => {
        setPendingCancel(null);
        setError(e instanceof Error ? e.message : 'Erreur');
      },
    });
  }

  return (
    <section className="anim-fade space-y-6">
      <ConfirmDialog
        open={pendingCancel !== null}
        title="Abandonner cette expédition ?"
        message={
          pendingCancel
            ? `${cancelType?.name ?? 'L’expédition'} est annulée : tu ne gagnes RIEN — ni or, ni XP, ni matériaux. ` +
              `Tes ${pendingCancel.hero_ids.length} héros redeviennent disponibles immédiatement. Action irréversible.`
            : ''
        }
        confirmLabel="Abandonner"
        danger
        busy={actions.cancel.isPending}
        onConfirm={confirmCancel}
        onCancel={() => setPendingCancel(null)}
      />
      <BackToActivities />
      <div className="panel relative overflow-hidden p-0">
        <div className="h-28 w-full sm:h-32 lg:h-36">
          <ExpeditionScene />
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/45 to-transparent p-4">
          <h2 className="heading flex items-center gap-2 text-2xl">
            <UiIcon name="map" size={24} color="var(--color-gold-soft)" />
            Table des Expéditions
          </h2>
          <p className="max-w-xl text-sm text-white/80">
            Envoie une escouade au loin (plusieurs heures) : elle revient chargée d'or, d'XP et de{' '}
            <strong>matériaux uniques</strong>. Une équipe plus forte revient plus vite.
          </p>
        </div>
      </div>

      <MasteryBanner info={mastery} />

      {error && <p className="text-sm text-[var(--color-ember)]">{error}</p>}

      {/* Voyages en cours */}
      {activeRuns.length > 0 && (
        <div className="space-y-3">
          <SectionTitle icon="loop" label="En route" count={activeRuns.length} />
          <div className="space-y-3">
            {activeRuns.map((run) => (
              <JourneyPanel
                key={run.id}
                run={run}
                type={(types ?? []).find((t) => t.id === run.expedition_type_id)}
                heroById={heroById}
                onClaim={() =>
                  actions.claim.mutate(run.id, {
                    onSuccess: (d) => setRewards(d.rewards),
                    onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
                  })
                }
                onCancel={() => setPendingCancel(run)}
                busy={actions.claim.isPending || actions.cancel.isPending}
              />
            ))}
          </div>
        </div>
      )}

      {/* Destinations */}
      <div className="space-y-3">
        <SectionTitle icon="map" label="Destinations" />
        {isLoading && <p className="text-[var(--color-muted)]">Chargement des expéditions…</p>}
        <div className="grid gap-3 lg:grid-cols-2">
          {(types ?? []).map((t) => (
            <DestinationPanel
              key={t.id}
              type={t}
              requiredPower={expeditionRequiredPower(t, currentArc)}
              active={selectedType === t.id}
              onClick={() => {
                setSelectedType(selectedType === t.id ? null : t.id);
                setPicked([]);
                setError(null);
              }}
            />
          ))}
        </div>
      </div>

      {/* Composeur d'escouade */}
      {type && (
        <PartyComposer
          type={type}
          heroList={heroList}
          picked={picked}
          teamPower={teamPower}
          powerOk={powerOk}
          availability={availability}
          masteryLevel={mastery.level}
          onToggle={toggleHero}
          onLaunch={launch}
          launching={actions.start.isPending}
        />
      )}

      {rewards && <RewardsModal rewards={rewards} onClose={() => setRewards(null)} />}
    </section>
  );
}

/* ------------------------------------------------------------------ atomes -- */

function SectionTitle({ icon, label, count }: { icon: 'loop' | 'map'; label: string; count?: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-px flex-1 bg-[var(--color-edge)]" />
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-[var(--color-muted)]">
        <UiIcon name={icon} size={12} color="currentColor" /> {label}
        {count != null && <span className="text-[var(--color-gold-soft)]">· {count}</span>}
      </span>
      <span className="h-px flex-1 bg-[var(--color-edge)]" />
    </div>
  );
}

function DangerMeter({ level, accent }: { level: number; accent: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={`Danger ${level}/5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <UiIcon
          key={i}
          name="skull"
          size={11}
          color={i < level ? accent : 'var(--color-edge-strong)'}
        />
      ))}
    </span>
  );
}

function PowerGauge({ current, required, accent }: { current: number; required: number; accent: string }) {
  const pct = Math.min(100, Math.round((current / Math.max(1, required)) * 100));
  const met = current >= required;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="inline-flex items-center gap-1 text-[var(--color-muted)]">
          <UiIcon name="power" size={11} color="currentColor" /> Puissance d'équipe
        </span>
        <span className={`font-semibold ${met ? 'text-emerald-300' : 'text-[var(--color-ember)]'}`}>
          {current} / {required}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full border border-[var(--color-edge)] bg-black/40">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: met ? '#5fd39b' : accent }}
        />
      </div>
    </div>
  );
}

/** Portrait circulaire d'un héros (icône de classe teintée + anneau d'accent). */
function HeroPortrait({ hero, size = 40 }: { hero: HeroView; size?: number }) {
  const accent = classMeta(hero.classId).accent;
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, backgroundColor: `${accent}22`, boxShadow: `inset 0 0 0 1.5px ${accent}88` }}
      title={hero.className}
    >
      <ClassIcon classId={hero.classId} size={Math.round(size * 0.58)} />
    </span>
  );
}

/* ----------------------------------------------------------- destination -- */

/** Bannière de maîtrise d'expédition : niveau, progression, bonus actifs. */
function MasteryBanner({ info }: { info: ReturnType<typeof expeditionLevelInfo> }) {
  const bonus = expeditionMasteryBonus(info.level);
  const atMax = info.level >= MAX_EXPEDITION_LEVEL;
  const pct = atMax ? 100 : info.xpForNext > 0 ? Math.round((info.xpInto / info.xpForNext) * 100) : 0;
  const speedPct = Math.round((1 - bonus.speedMult) * 100);
  const qtyPct = Math.round((bonus.qtyMult - 1) * 100);
  const luckPct = Math.round(bonus.luckBonus * 100);
  return (
    <div className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="flex items-center gap-3">
        <span
          className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl border border-[var(--color-gold-soft)]/50 bg-[var(--color-gold-soft)]/10"
          title="Niveau de maîtrise d'expédition"
        >
          <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">Niv.</span>
          <span className="-mt-0.5 font-display text-lg font-bold text-[var(--color-gold-soft)]">{info.level}</span>
        </span>
        <div className="min-w-0">
          <div className="font-display text-sm font-semibold text-[var(--color-ink)]">Maîtrise d'expédition</div>
          <div className="text-[11px] text-[var(--color-muted)]">
            {atMax ? 'Maîtrise maximale atteinte' : `${info.xpInto} / ${info.xpForNext} XP`}
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-2">
        <div className="h-2 w-full overflow-hidden rounded-full bg-black/30">
          <div
            className="h-full rounded-full bg-[var(--color-gold-soft)] transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex flex-wrap gap-1.5 text-[10px]">
          <span className="chip bg-white/5">⏱ Durée −{speedPct}%</span>
          <span className="chip bg-white/5">📦 Quantités +{qtyPct}%</span>
          <span className="chip bg-white/5">🍀 Loot assuré +{luckPct}%</span>
        </div>
      </div>
    </div>
  );
}

function DestinationPanel({
  type,
  requiredPower,
  active,
  onClick,
}: {
  type: ExpeditionTypeRow;
  requiredPower: number;
  active: boolean;
  onClick: () => void;
}) {
  const { art, accent } = expMeta(type.id);
  return (
    <button
      onClick={onClick}
      className="panel group relative overflow-hidden p-0 text-left transition-transform duration-200 hover:-translate-y-0.5"
      style={active ? { borderColor: accent, boxShadow: `0 0 0 1px ${accent}, 0 0 24px -6px ${accent}` } : undefined}
    >
      {/* halo d'accent en fond */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-8 h-32 w-32 rounded-full opacity-20 blur-xl transition-opacity group-hover:opacity-30"
        style={{ backgroundColor: accent }}
      />
      <div className="relative flex items-start gap-3 p-4">
        <span
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-[var(--color-edge)]"
          style={{ backgroundColor: `${accent}14` }}
        >
          <SyntyImg src={art} size={48} title={type.name} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-display text-base font-semibold text-[var(--color-ink)]">
              {type.name}
            </span>
            <DangerMeter level={dangerLevel(type.min_level_required)} accent={accent} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--color-muted)]">
            <span className="inline-flex items-center gap-1">
              <UiIcon name="loop" size={11} color="currentColor" /> {fmtDuration(type.duration_base_seconds)}
            </span>
            <span className="inline-flex items-center gap-1" style={{ color: accent }}>
              <UiIcon name="power" size={11} color="currentColor" /> {requiredPower}
            </span>
            <span className="chip bg-white/5 text-[10px]">Niv. {type.min_level_required}+</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {type.loot_table.map((l) => (
              <span
                key={l.resource}
                className="inline-flex items-center gap-1 rounded-md bg-black/25 px-1.5 py-0.5 text-[10px] text-[var(--color-ink)]/80"
                title={resourceMeta(l.resource).label}
              >
                <ResourceIcon resKey={l.resource} size={13} /> {resourceMeta(l.resource).label}
              </span>
            ))}
          </div>
        </div>
      </div>
      {/* liseré d'accent bas */}
      <span className="block h-1 w-full" style={{ backgroundColor: active ? accent : 'transparent' }} />
    </button>
  );
}

/* --------------------------------------------------------------- composer -- */

function PartyComposer({
  type,
  heroList,
  picked,
  teamPower,
  powerOk,
  availability,
  masteryLevel,
  onToggle,
  onLaunch,
  launching,
}: {
  type: ExpeditionTypeRow;
  heroList: HeroView[];
  picked: string[];
  teamPower: number;
  powerOk: boolean;
  availability: ReturnType<typeof useHeroAvailability>;
  masteryLevel: number;
  onToggle: (id: string) => void;
  onLaunch: () => void;
  launching: boolean;
}) {
  const { currentArc } = useArc();
  const { art, accent } = expMeta(type.id);
  const minLevel = picked.length
    ? Math.min(...picked.map((id) => heroList.find((h) => h.id === id)?.level ?? 1))
    : type.min_level_required;

  return (
    <div className="panel anim-slide overflow-hidden p-0" style={{ borderColor: `${accent}66` }}>
      {/* En-tête briefing */}
      <div className="flex items-center gap-3 border-b border-[var(--color-edge)] p-4" style={{ backgroundColor: `${accent}10` }}>
        <SyntyImg src={art} size={40} title={type.name} />
        <div className="min-w-0 flex-1">
          <div className="font-display text-lg font-semibold text-[var(--color-ink)]">
            Composer l'escouade
          </div>
          <div className="text-xs text-[var(--color-muted)]">{type.name}</div>
        </div>
        <span className="chip bg-white/5 text-xs text-[var(--color-muted)]">
          {picked.length}/{MAX_TEAM}
        </span>
      </div>

      <div className="space-y-4 p-4">
        {/* Grille de héros */}
        {heroList.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)]">Aucun héros — recrute à la Taverne.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {heroList.map((h) => {
              const chosen = picked.includes(h.id);
              const busy = heroIsBusy(availability.get(h.id));
              const tooLow = h.level < type.min_level_required;
              const blocked = busy || tooLow;
              const reason = busy
                ? HERO_STATUS_LABEL[availability.get(h.id)!]
                : tooLow
                  ? `Niv. ${type.min_level_required} requis`
                  : null;
              return (
                <button
                  key={h.id}
                  onClick={() => !blocked && onToggle(h.id)}
                  disabled={blocked}
                  title={reason ? `${h.name} — ${reason}` : h.name}
                  className={`flex items-center gap-2.5 rounded-lg border p-2 text-left transition ${
                    chosen
                      ? 'bg-white/[0.03]'
                      : 'border-[var(--color-edge)] hover:border-[var(--color-edge-strong)]'
                  } ${blocked ? 'cursor-not-allowed opacity-40' : ''}`}
                  style={chosen ? { borderColor: accent, boxShadow: `inset 0 0 0 1px ${accent}55` } : undefined}
                >
                  <HeroPortrait hero={h} size={38} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-[var(--color-ink)]">{h.name}</div>
                    <div className="text-[10px] text-[var(--color-muted)]">
                      {reason ?? `${h.className} · N.${h.level}`}
                    </div>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-[var(--color-gold-soft)]">
                    <UiIcon name="power" size={11} color="currentColor" /> {h.power}
                  </span>
                  {chosen && (
                    <span
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-black"
                      style={{ backgroundColor: accent }}
                    >
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Jauge de puissance + durée */}
        {picked.length > 0 && (
          <div className="space-y-2 rounded-lg border border-[var(--color-edge)] bg-black/20 p-3">
            <PowerGauge current={teamPower} required={expeditionRequiredPower(type, currentArc)} accent={accent} />
            <div className="flex items-center justify-between text-[11px] text-[var(--color-muted)]">
              <span className="inline-flex items-center gap-1">
                <UiIcon name="loop" size={11} color="currentColor" /> Retour estimé
              </span>
              <span className="text-[var(--color-ink)]">
                {fmtDuration(computeExpeditionDuration(type, minLevel, masteryLevel))}
              </span>
            </div>
          </div>
        )}

        <button
          onClick={onLaunch}
          disabled={picked.length === 0 || !powerOk || launching}
          className="btn btn-primary w-full text-sm"
        >
          {launching
            ? 'Départ…'
            : picked.length === 0
              ? 'Choisis au moins un héros'
              : !powerOk
                ? 'Puissance insuffisante'
                : "Lancer l'expédition"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------ paysage animé -- */

type LandTheme = {
  sky0: string;
  sky1: string;
  far: string;
  near: string;
  mid: string;
  ground: string;
  glow: string;
  ambient: 'fireflies' | 'bubbles' | 'embers' | 'heat';
  rays: boolean;
  kind: 'trees' | 'columns' | 'rocks' | 'dunes';
};

const LAND_THEMES: Record<string, LandTheme> = {
  forest: { sky0: '#16321f', sky1: '#08130c', far: '#274a34', near: '#0f2817', mid: '#1c3d27', ground: '#0b1c11', glow: '#9bf0b4', ambient: 'fireflies', rays: false, kind: 'trees' },
  ruins: { sky0: '#123049', sky1: '#05101c', far: '#1e4763', near: '#0c2536', mid: '#173a52', ground: '#07161f', glow: '#8fd6ff', ambient: 'bubbles', rays: true, kind: 'columns' },
  mines: { sky0: '#2a1108', sky1: '#0c0402', far: '#4a2413', near: '#241209', mid: '#37200f', ground: '#150a05', glow: '#ff9d52', ambient: 'embers', rays: false, kind: 'rocks' },
  dunes: { sky0: '#3a2c14', sky1: '#160f07', far: '#5a4520', near: '#2a1f0e', mid: '#40311a', ground: '#180f06', glow: '#ffe3a0', ambient: 'heat', rays: false, kind: 'dunes' },
};

const LAND_BY_ID: Record<string, keyof typeof LAND_THEMES> = {
  exp_foret_fossile: 'forest',
  exp_ruines_englouties: 'ruins',
  exp_mines_abyssales: 'mines',
};

/** Couche qui défile en boucle (2 copies décalées de 680) — figée si `moving` est faux. */
function ScrollLayer({ dur, moving, children }: { dur: number; moving: boolean; children: React.ReactNode }) {
  return (
    <g>
      {moving && (
        <animateTransform
          attributeName="transform"
          type="translate"
          from="0 0"
          to="-680 0"
          dur={`${dur}s`}
          repeatCount="indefinite"
        />
      )}
      {children}
      <g transform="translate(680,0)">{children}</g>
    </g>
  );
}

/** Grande silhouette de fond selon la destination (tuile de 680, sol à y=96). */
function FarTile({ t }: { t: LandTheme }) {
  const c = t.far;
  if (t.kind === 'trees') {
    return (
      <g fill={c}>
        {[60, 300, 560].map((x, i) => (
          <g key={i} transform={`translate(${x},0)`}>
            <path d="M-14,96 Q-8,50 -4,30 Q0,20 4,30 Q8,50 14,96 Z" />
            <path d="M-4,40 Q-24,30 -34,14" stroke={c} strokeWidth="5" fill="none" strokeLinecap="round" />
            <path d="M2,50 Q22,42 34,26" stroke={c} strokeWidth="4" fill="none" strokeLinecap="round" />
          </g>
        ))}
        <path d="M150,96 Q170,26 250,26 Q330,26 350,96" fill="none" stroke={c} strokeWidth="6" opacity="0.7" />
      </g>
    );
  }
  if (t.kind === 'columns') {
    return (
      <g fill={c}>
        <g transform="translate(300,0)">
          <polygon points="-70,44 0,20 70,44" />
          <rect x="-64" y="44" width="128" height="8" />
          {[-52, -26, 0, 26, 52].map((x, i) => (
            <rect key={i} x={x - 5} y="52" width="10" height="44" />
          ))}
          <rect x="-70" y="94" width="140" height="4" />
        </g>
        {[70, 560, 620].map((x, i) => (
          <rect key={i} x={x - 6} y={i % 2 ? 54 : 40} width="12" height={i % 2 ? 42 : 56} opacity="0.8" />
        ))}
      </g>
    );
  }
  if (t.kind === 'rocks') {
    return (
      <g>
        <path d="M0,40 Q120,20 240,44 Q360,66 480,40 Q600,20 680,46 L680,96 L0,96 Z" fill={c} />
        {[120, 330, 520].map((x, i) => (
          <g key={i} transform={`translate(${x},96)`}>
            <polygon points="-10,0 -6,-30 0,0" fill={t.glow} opacity="0.5" />
            <polygon points="-2,0 4,-40 8,0" fill={t.glow} opacity="0.8" />
            <polygon points="6,0 12,-24 16,0" fill={t.glow} opacity="0.45" />
          </g>
        ))}
      </g>
    );
  }
  return (
    <g fill={c}>
      <path d="M0,80 Q170,52 340,78 Q510,100 680,74 L680,96 L0,96 Z" />
      <g transform="translate(300,0)">
        <polygon points="-8,96 -6,34 0,26 6,34 8,96" opacity="0.9" />
        <polygon points="0,26 6,34 0,40" fill={t.mid} />
      </g>
    </g>
  );
}

/** Objets de premier plan qui défilent selon la destination (tuile de 680, sol y=96). */
function NearTile({ t }: { t: LandTheme }) {
  const { near, mid, glow, kind } = t;
  if (kind === 'trees') {
    const stumps = [40, 150, 250, 360, 470, 560, 650];
    return (
      <g>
        {stumps.map((x, i) => {
          const h = 12 + (i % 3) * 6;
          return (
            <g key={i} transform={`translate(${x},96)`}>
              <path d={`M-8,0 Q-5,-${h} 0,-${h + 2} Q5,-${h} 8,0 Z`} fill={near} />
              <ellipse cx="0" cy={-(h + 2)} rx="6" ry="2" fill={mid} />
            </g>
          );
        })}
        {[100, 210, 320, 430, 600].map((x, i) => (
          <g key={i} transform={`translate(${x},96)`} stroke={mid} strokeWidth="1.6" fill="none" strokeLinecap="round">
            <path d="M0,0 Q-6,-10 -12,-14 M0,0 Q0,-12 0,-18 M0,0 Q6,-10 12,-14" />
          </g>
        ))}
        <g transform="translate(500,94)" fill={mid}>
          <rect x="-8" y="-2" width="16" height="3" rx="1.5" />
          <circle cx="-9" cy="-0.5" r="2.5" />
          <circle cx="9" cy="-0.5" r="2.5" />
        </g>
      </g>
    );
  }
  if (kind === 'columns') {
    const drums: [number, number][] = [[60, 3], [300, 2], [520, 4]];
    return (
      <g>
        {drums.map(([x, n], i) => (
          <g key={i} transform={`translate(${x},96)`} fill={near}>
            {Array.from({ length: n }, (_, k) => (
              <ellipse key={k} cx={k * 20} cy={-4} rx="10" ry="4" />
            ))}
          </g>
        ))}
        <g transform="translate(200,96)" fill={near}>
          <path d="M-9,0 Q-11,-16 0,-18 Q11,-16 9,0 Z" />
          <ellipse cx="0" cy="-18" rx="9" ry="4" fill={mid} />
        </g>
        {[120, 400, 620].map((x, i) => (
          <path key={i} d={`M${x},96 q-4,-14 2,-24 q6,-8 -2,-16`} stroke={glow} strokeWidth="2.4" fill="none" opacity="0.5" strokeLinecap="round">
            <animate attributeName="d" values={`M${x},96 q-4,-14 2,-24 q6,-8 -2,-16;M${x},96 q4,-14 -2,-24 q-6,-8 2,-16;M${x},96 q-4,-14 2,-24 q6,-8 -2,-16`} dur="4s" repeatCount="indefinite" />
          </path>
        ))}
      </g>
    );
  }
  if (kind === 'rocks') {
    return (
      <g>
        <rect x="0" y="92" width="680" height="2" fill={mid} />
        {Array.from({ length: 18 }, (_, i) => (
          <rect key={i} x={i * 40} y="90" width="6" height="6" fill={near} />
        ))}
        <g transform="translate(470,80)" fill={near}>
          <path d="M-14,0 L14,0 L11,12 L-11,12 Z" />
          <rect x="-15" y="-3" width="30" height="4" fill={mid} />
          <circle cx="-8" cy="14" r="3" fill={mid} />
          <circle cx="8" cy="14" r="3" fill={mid} />
          <rect x="-6" y="-8" width="12" height="6" fill={glow} opacity="0.7" />
        </g>
        {[80, 200, 330, 600].map((x, i) => (
          <polygon key={i} points={`${x - 5},96 ${x},${96 - (14 + (i % 3) * 8)} ${x + 5},96`} fill={glow} opacity="0.7">
            <animate attributeName="opacity" values="0.4;0.85;0.4" dur={`${2 + (i % 3)}s`} repeatCount="indefinite" />
          </polygon>
        ))}
      </g>
    );
  }
  const rocks = [70, 190, 300, 430, 560, 650];
  return (
    <g fill={near}>
      {rocks.map((x, i) => (
        <ellipse key={i} cx={x} cy={95} rx={10 + (i % 3) * 5} ry={5 + (i % 2) * 3} />
      ))}
      <g transform="translate(360,92)" fill={mid}>
        <circle cx="0" cy="0" r="4" />
        <rect x="-2" y="2" width="4" height="3" />
      </g>
      <g transform="translate(150,96)" stroke={mid} strokeWidth="1.4" fill="none" strokeLinecap="round">
        <path d="M0,0 V-10 M0,-6 l-5,-5 M0,-6 l5,-5" />
      </g>
    </g>
  );
}

/** Particules d'ambiance selon la destination (lucioles / bulles / braises / chaleur). */
function Ambient({ t, moving }: { t: LandTheme; moving: boolean }) {
  if (t.ambient === 'fireflies') {
    return (
      <g>
        {[120, 250, 360, 470, 560, 300, 180].map((x, i) => (
          <circle key={i} cx={x} cy={40 + (i % 4) * 12} r="1.4" fill={t.glow} filter="url(#tl-glow)">
            <animate attributeName="opacity" values="0;1;0" dur={`${2 + (i % 3)}s`} begin={`${i * 0.4}s`} repeatCount="indefinite" />
            <animate attributeName="cy" values={`${40 + (i % 4) * 12};${30 + (i % 4) * 12};${40 + (i % 4) * 12}`} dur={`${3 + (i % 3)}s`} begin={`${i * 0.4}s`} repeatCount="indefinite" />
          </circle>
        ))}
      </g>
    );
  }
  if (t.ambient === 'bubbles') {
    return (
      <g>
        {[80, 170, 300, 420, 520, 610, 240].map((x, i) => (
          <circle key={i} cx={x} cy={96} r={i % 2 ? 2 : 1.3} fill="none" stroke={t.glow} strokeWidth="0.8" opacity="0.6">
            <animate attributeName="cy" values="96;6" dur={`${4 + (i % 4)}s`} begin={`${i * 0.7}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;0.6;0" dur={`${4 + (i % 4)}s`} begin={`${i * 0.7}s`} repeatCount="indefinite" />
          </circle>
        ))}
      </g>
    );
  }
  if (t.ambient === 'embers') {
    return (
      <g>
        {[100, 220, 340, 460, 560, 640, 300].map((x, i) => (
          <circle key={i} cx={x} cy={96} r={i % 2 ? 1.6 : 1} fill={i % 2 ? '#ffd27a' : t.glow} filter="url(#tl-glow)">
            <animate attributeName="cy" values="96;10" dur={`${3 + (i % 3)}s`} begin={`${i * 0.5}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;0.9;0" dur={`${3 + (i % 3)}s`} begin={`${i * 0.5}s`} repeatCount="indefinite" />
          </circle>
        ))}
      </g>
    );
  }
  return (
    <g stroke={t.glow} strokeWidth="1" fill="none" opacity="0.16">
      {[70, 74, 78].map((y, i) => (
        <path key={i} d={`M0,${y} q40,-4 80,0 t160,0 t160,0 t160,0 t160,0`}>
          {moving && (
            <animate attributeName="d" values={`M0,${y} q40,-4 80,0 t160,0 t160,0 t160,0 t160,0;M0,${y} q40,4 80,0 t160,0 t160,0 t160,0 t160,0;M0,${y} q40,-4 80,0 t160,0 t160,0 t160,0 t160,0`} dur={`${3 + i}s`} repeatCount="indefinite" />
          )}
        </path>
      ))}
    </g>
  );
}

/** La compagnie qui voyage : un porteur de torche + deux compagnons, au centre. */
function Party({ t, moving }: { t: LandTheme; moving: boolean }) {
  const Walker = ({ dx, begin }: { dx: number; begin: string }) => (
    <g transform={`translate(${dx},0)`}>
      {moving && (
        <animateTransform attributeName="transform" type="translate" values={`${dx} 0;${dx} -1.5;${dx} 0`} dur="0.7s" begin={begin} repeatCount="indefinite" additive="sum" />
      )}
      <circle cx="0" cy="-11" r="3" fill="#0b0a10" />
      <path d="M-2.6,-8 Q-3.4,-2 -3,2 L3,2 Q3.4,-2 2.6,-8 Z" fill="#0b0a10" />
    </g>
  );
  return (
    <g transform="translate(300,96)">
      <circle cx="-22" cy="-10" r="20" fill={t.glow} opacity="0.14" filter="url(#tl-soft)" />
      <ellipse cx="2" cy="3" rx="26" ry="3" fill="#000" opacity="0.35" />
      <Walker dx={6} begin="0.15s" />
      <Walker dx={16} begin="0.3s" />
      <g transform="translate(-10,0)">
        {moving && (
          <animateTransform attributeName="transform" type="translate" values="-10 0;-10 -1.5;-10 0" dur="0.7s" repeatCount="indefinite" additive="sum" />
        )}
        <circle cx="0" cy="-12" r="3.2" fill="#0b0a10" />
        <path d="M-3,-9 Q-4,-2 -3.4,2 L3.4,2 Q4,-2 3,-9 Z" fill="#0b0a10" />
        <line x1="3" y1="-8" x2="9" y2="-18" stroke="#4a3524" strokeWidth="1.6" />
        <circle cx="9.5" cy="-19" r="2.4" fill="#ffd27a" filter="url(#tl-glow)">
          <animate attributeName="r" values="2;3;2" dur="0.5s" repeatCount="indefinite" />
        </circle>
      </g>
    </g>
  );
}

/** Bandeau paysage : décor propre à la destination, qui défile pendant le voyage. */
function TravelLandscape({ id, moving }: { id: string; moving: boolean }) {
  const uid = LAND_BY_ID[id] ?? 'dunes';
  const t = LAND_THEMES[uid]!;
  return (
    <svg viewBox="0 0 680 120" className="block h-auto w-full" role="img" aria-label="Paysage d'expédition">
      <defs>
        <linearGradient id={`tl-sky-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={t.sky0} />
          <stop offset="100%" stopColor={t.sky1} />
        </linearGradient>
        <filter id="tl-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="1.3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="tl-soft" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      <rect x="0" y="0" width="680" height="120" fill={`url(#tl-sky-${uid})`} />

      {/* Source lumineuse d'ambiance */}
      <circle cx="560" cy="34" r="30" fill={t.glow} opacity="0.14" filter="url(#tl-soft)" />
      <circle cx="560" cy="34" r="11" fill={t.glow} opacity="0.3" filter="url(#tl-glow)" />

      {/* Rayons de lumière (ruines englouties) */}
      {t.rays && (
        <g fill={t.glow} opacity="0.06">
          {[120, 300, 480].map((x, i) => (
            <polygon key={i} points={`${x},0 ${x + 40},0 ${x - 30},120 ${x - 90},120`} />
          ))}
        </g>
      )}

      {/* Fond lointain (lent) */}
      <ScrollLayer dur={60} moving={moving}>
        <FarTile t={t} />
      </ScrollLayer>

      {/* Sol */}
      <rect x="0" y="96" width="680" height="24" fill={t.ground} />
      <rect x="0" y="96" width="680" height="2" fill={t.mid} opacity="0.7" />

      {/* Premier plan (rapide) */}
      <ScrollLayer dur={18} moving={moving}>
        <NearTile t={t} />
      </ScrollLayer>

      {/* Ambiance (particules) */}
      <Ambient t={t} moving={moving} />

      {/* La compagnie qui voyage */}
      <Party t={t} moving={moving} />
    </svg>
  );
}

/* --------------------------------------------------------------- journey -- */

function JourneyPanel({
  run,
  type,
  heroById,
  onClaim,
  onCancel,
  busy,
}: {
  run: ExpeditionRunRow;
  type: ExpeditionTypeRow | undefined;
  heroById: (id: string) => HeroView | undefined;
  onClaim: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const { art, accent } = expMeta(run.expedition_type_id);
  const endsAt = Date.parse(run.ends_at);
  const remaining = (endsAt - now) / 1000;
  const done = remaining <= 0;
  const total = (endsAt - Date.parse(run.started_at)) / 1000;
  const pct = Math.min(100, Math.max(0, ((total - remaining) / Math.max(1, total)) * 100));

  return (
    <div
      className="panel relative overflow-hidden p-4"
      style={done ? { borderColor: '#5fd39b', boxShadow: '0 0 24px -8px #5fd39b' } : { borderColor: `${accent}55` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <SyntyImg src={art} size={40} title={type?.name ?? 'Expédition'} className={done ? '' : 'opacity-90'} />
          <div>
            <div className="font-display font-semibold text-[var(--color-ink)]">
              {type?.name ?? 'Expédition'}
            </div>
            <div className="flex -space-x-1.5 pt-1">
              {run.hero_ids.map((id) => {
                const h = heroById(id);
                return h ? (
                  <HeroPortrait key={id} hero={h} size={24} />
                ) : (
                  <span
                    key={id}
                    className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-edge)] bg-[var(--color-panel-2)] text-[10px] text-[var(--color-muted)]"
                  >
                    ?
                  </span>
                );
              })}
            </div>
          </div>
        </div>
        {done ? (
          <button
            onClick={onClaim}
            disabled={busy}
            className="btn btn-primary animate-pulse px-4 py-1.5 text-xs"
          >
            <UiIcon name="gold" size={12} color="currentColor" /> Réclamer
          </button>
        ) : (
          <button
            onClick={onCancel}
            disabled={busy}
            title="Rappeler l'escouade — aucune récompense"
            className="btn btn-ghost px-3 py-1.5 text-xs text-[var(--color-ember)] hover:bg-[var(--color-ember)]/10"
          >
            Abandonner
          </button>
        )}
      </div>

      {/* Paysage qui défile pendant le voyage (figé au retour) */}
      <div
        className="mt-3 overflow-hidden rounded-lg border"
        style={{ borderColor: done ? '#5fd39b55' : `${accent}44` }}
      >
        <TravelLandscape id={run.expedition_type_id} moving={!done} />
      </div>

      {/* Trajet : maison → marqueur → destination */}
      <div className="relative mt-4 h-6">
        <span className="absolute left-0 top-1/2 -translate-y-1/2">
          <UiIcon name="tavern" size={14} color="var(--color-muted)" />
        </span>
        <span className="absolute right-0 top-1/2 -translate-y-1/2">
          <SyntyImg src={art} size={16} />
        </span>
        <div className="absolute left-5 right-5 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-[var(--color-edge)]" />
        <div
          className="absolute left-5 top-1/2 h-0.5 -translate-y-1/2 rounded-full transition-all duration-1000"
          style={{ width: `calc((100% - 40px) * ${pct / 100})`, backgroundColor: done ? '#5fd39b' : accent }}
        />
        <span
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--color-panel)] transition-all duration-1000"
          style={{ left: `calc(20px + (100% - 40px) * ${pct / 100})`, backgroundColor: done ? '#5fd39b' : accent }}
        />
      </div>
      <div className="mt-1.5 text-center text-xs">
        {done ? (
          <span className="font-semibold text-emerald-300">De retour — récompenses prêtes</span>
        ) : (
          <span className="text-[var(--color-muted)]">
            Retour dans <span className="tabular-nums text-[var(--color-ink)]">{fmtDuration(remaining)}</span>
          </span>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- rewards -- */

function RewardsModal({ rewards, onClose }: { rewards: ExpeditionRewards; onClose: () => void }) {
  return (
    <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="panel anim-pop w-full max-w-sm p-5 text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-gold)]/15">
          <UiIcon name="victory" size={26} />
        </div>
        <h3 className="heading text-lg">Escouade de retour !</h3>
        <div className="mt-3 flex flex-wrap justify-center gap-2 text-xs">
          {rewards.gold > 0 && (
            <span className="chip inline-flex items-center gap-1 bg-[var(--color-gold)]/15 text-[var(--color-gold-soft)]">
              <UiIcon name="gold" size={12} /> +{rewards.gold} or
            </span>
          )}
          {rewards.xp_per_hero > 0 && (
            <span className="chip inline-flex items-center gap-1 bg-[var(--color-arcane)]/20 text-[var(--color-ink)]">
              <UiIcon name="xp" size={12} /> +{rewards.xp_per_hero} XP / héros
            </span>
          )}
          {rewards.expedition_xp != null && rewards.expedition_xp > 0 && (
            <span className="chip inline-flex items-center gap-1 bg-[var(--color-gold-soft)]/15 text-[var(--color-gold-soft)]">
              <UiIcon name="map" size={12} /> +{rewards.expedition_xp} maîtrise
            </span>
          )}
          {rewards.loot.map((l) => (
            <span key={l.resource} className="chip inline-flex items-center gap-1 bg-white/5 text-[var(--color-ink)]">
              <ResourceIcon resKey={l.resource} /> +{l.amount} {resourceMeta(l.resource).label}
            </span>
          ))}
        </div>
        <button onClick={onClose} className="btn btn-primary mt-4 w-full text-sm">
          Continuer
        </button>
      </div>
    </div>
  );
}
