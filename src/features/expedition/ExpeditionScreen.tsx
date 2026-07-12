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
import { useMarkExpeditionsSeen } from '@/hooks/useActionAlerts';
import { computeExpeditionDuration, expeditionRequiredPower } from '@shared/progression/expedition';
import { useArc } from '@/features/arc/useArc';
import {
  useExpeditionTypes,
  useActiveExpeditions,
  useExpeditionActions,
  type ExpeditionTypeRow,
  type ExpeditionRunRow,
  type ExpeditionRewards,
} from './useExpedition';

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

  const { currentArc } = useArc();
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

  return (
    <section className="anim-fade space-y-6">
      <BackToActivities />
      <div>
        <h2 className="heading flex items-center gap-2 text-2xl">
          <UiIcon name="map" size={24} color="var(--color-gold-soft)" />
          Table des Expéditions
        </h2>
        <p className="text-sm text-[var(--color-muted)]">
          Envoie une escouade au loin (plusieurs heures) : elle revient chargée d'or, d'XP et de{' '}
          <strong>matériaux uniques</strong>. Une équipe plus forte revient plus vite.
        </p>
      </div>

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
                onCancel={() => actions.cancel.mutate(run.id)}
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
                {fmtDuration(computeExpeditionDuration(type, minLevel))}
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
  kind: 'trees' | 'columns' | 'rocks' | 'dunes';
};

const LAND_THEMES: Record<string, LandTheme> = {
  forest: { sky0: '#20361f', sky1: '#0b140d', far: '#2c4a33', near: '#132a1a', mid: '#1f3d28', ground: '#0e2013', glow: '#7fe3a6', kind: 'trees' },
  ruins: { sky0: '#15293b', sky1: '#081019', far: '#22415a', near: '#0f2536', mid: '#1a374d', ground: '#091a27', glow: '#7cc6f7', kind: 'columns' },
  mines: { sky0: '#301810', sky1: '#100604', far: '#4a2415', near: '#26140d', mid: '#3a2013', ground: '#180b06', glow: '#ffa46a', kind: 'rocks' },
  dunes: { sky0: '#2c2412', sky1: '#120e07', far: '#4a3a1a', near: '#281f0e', mid: '#3a2f16', ground: '#170f06', glow: '#ffd27a', kind: 'dunes' },
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

/** Silhouette de collines lointaines (une tuile de 680 de large). */
function FarHills({ c }: { c: string }) {
  return (
    <path
      d="M0,78 Q70,56 140,70 Q210,82 280,60 Q350,44 420,66 Q490,84 560,58 Q615,44 680,66 L680,110 L0,110 Z"
      fill={c}
    />
  );
}

/** Objets de premier plan selon le thème (une tuile de 680). */
function NearTile({ theme }: { theme: LandTheme }) {
  const { near, mid, kind } = theme;
  if (kind === 'trees') {
    const xs = [24, 118, 214, 312, 408, 512, 616, 664];
    return (
      <g>
        {xs.map((x, i) => (
          <g key={i} transform={`translate(${x},92)`}>
            <rect x={-3} y={-13} width={6} height={13} fill={near} />
            <polygon points="0,-36 -14,-11 14,-11" fill={near} />
            <polygon points="0,-28 -10,-9 10,-9" fill={mid} />
          </g>
        ))}
      </g>
    );
  }
  if (kind === 'columns') {
    const cols: [number, number][] = [[40, 34], [150, 22], [255, 38], [360, 18], [470, 30], [560, 26], [650, 20]];
    return (
      <g>
        {cols.map(([x, h], i) => (
          <g key={i} transform={`translate(${x},92)`}>
            <rect x={-9} y={-h} width={18} height={h} fill={near} />
            <rect x={-11} y={-h - 5} width={22} height={5} fill={mid} />
            <rect x={-6} y={-h * 0.55} width={12} height={2} fill={mid} opacity={0.6} />
          </g>
        ))}
      </g>
    );
  }
  if (kind === 'rocks') {
    const stal: [number, number][] = [[50, 34], [150, 24], [250, 42], [350, 22], [450, 34], [545, 46], [645, 28]];
    const stac = [95, 300, 520];
    return (
      <g>
        {stac.map((x, i) => (
          <polygon key={`s${i}`} points={`${x - 11},0 ${x + 11},0 ${x},26`} fill={near} />
        ))}
        {stal.map(([x, h], i) => (
          <polygon key={`g${i}`} points={`${x - 15},92 ${x},${92 - h} ${x + 15},92`} fill={near} />
        ))}
        {stal.map(([x, h], i) => (
          <polygon key={`m${i}`} points={`${x - 7},92 ${x},${92 - h * 0.7} ${x + 7},92`} fill={mid} />
        ))}
      </g>
    );
  }
  // dunes
  const d = [90, 280, 470, 650];
  return (
    <g>
      {d.map((x, i) => (
        <ellipse key={i} cx={x} cy={100} rx={120} ry={26} fill={i % 2 ? mid : near} />
      ))}
    </g>
  );
}

/** Bandeau paysage : décor par destination qui défile pendant le voyage. */
function TravelLandscape({ id, moving }: { id: string; moving: boolean }) {
  const theme = LAND_THEMES[LAND_BY_ID[id] ?? 'dunes']!;
  const uid = LAND_BY_ID[id] ?? 'dunes';
  return (
    <svg viewBox="0 0 680 110" className="block h-auto w-full" role="img" aria-label="Paysage d'expédition">
      <defs>
        <linearGradient id={`sky-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={theme.sky0} />
          <stop offset="100%" stopColor={theme.sky1} />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="680" height="110" fill={`url(#sky-${uid})`} />
      <circle cx="590" cy="30" r="34" fill={theme.glow} opacity="0.12" />
      <circle cx="590" cy="30" r="15" fill={theme.glow} opacity="0.22" />
      {[40, 120, 210, 300, 470, 640].map((x, i) => (
        <circle key={i} cx={x} cy={18 + (i % 3) * 8} r={i % 2 ? 1.3 : 0.9} fill="#ffffff" opacity="0.35" />
      ))}

      {/* Collines lointaines (lentes) */}
      <ScrollLayer dur={48} moving={moving}>
        <FarHills c={theme.far} />
      </ScrollLayer>

      {/* Sol */}
      <rect x="0" y="92" width="680" height="18" fill={theme.ground} />
      <rect x="0" y="92" width="680" height="2" fill={theme.mid} opacity="0.6" />

      {/* Premier plan (rapide) */}
      <ScrollLayer dur={19} moving={moving}>
        <NearTile theme={theme} />
      </ScrollLayer>

      {/* Caravane (silhouettes qui avancent sur place) */}
      <g transform="translate(300,98)">
        {moving && (
          <animateTransform attributeName="transform" type="translate" values="0 0; 0 -2; 0 0" dur="0.7s" repeatCount="indefinite" additive="sum" />
        )}
        {[0, 16, 32].map((dx, i) => (
          <g key={i} transform={`translate(${dx},0)`}>
            <circle cx="0" cy="-9" r="2.6" fill="#0a0a0f" />
            <rect x="-1.4" y="-7" width="2.8" height="7" rx="1.2" fill="#0a0a0f" />
          </g>
        ))}
      </g>
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
          <button onClick={onCancel} disabled={busy} className="btn btn-ghost px-3 py-1.5 text-xs">
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
