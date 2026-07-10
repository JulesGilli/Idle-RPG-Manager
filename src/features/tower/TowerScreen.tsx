import { useEffect, useRef, useState } from 'react';
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
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { resourceMeta } from '@/hooks/useResources';
import { CombatReplay, type StoredCombat } from '@/components/CombatReplay';
import { TOWER_MAX_FLOOR, FLOORS_PER_ZONE, TOWER_CLASSES, towerFloorReward, towerFloorResources } from '@shared/progression/tower';
import { useRelease, formatCountdown } from '@/features/release/useRelease';
import {
  useTowerProgress,
  useClimbTower,
  type TowerClimbResponse,
  type TowerFightResult,
  type TowerCombat,
} from './useTower';

const ACCENT = '#8b5cf6';

/** Gemme lâchée au palier de boss d'une zone (clé `gemme_*` dans les récompenses). */
function bossGem(bossFloor: number): string | null {
  return Object.keys(towerFloorResources(bossFloor)).find((k) => k.startsWith('gemme_')) ?? null;
}

function toStored(c: TowerCombat): StoredCombat {
  return { rounds: c.rounds, result: c.result, events: c.events, final_state: c.finalState };
}

/** guardian → miniboss pour l'icône d'ennemi du replay (boss reste boss). */
function replayKind(kind: TowerFightResult['kind']): 'normal' | 'miniboss' | 'boss' {
  return kind === 'guardian' ? 'miniboss' : kind;
}

export function TowerScreen() {
  const { data: heroes } = useHeroes();
  const { data: progressByClass } = useTowerProgress();
  const availability = useHeroAvailability();
  const climb = useClimbTower();
  const release = useRelease();

  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [result, setResult] = useState<TowerClimbResponse | null>(null);
  const [replayIdx, setReplayIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const heroList = heroes ?? [];
  const progress = progressByClass ?? {};

  const bestFloor = selectedClass ? (progress[selectedClass] ?? 0) : 0;
  const nextFloor = Math.min(TOWER_MAX_FLOOR, bestFloor + 1);
  const toppedOut = bestFloor >= TOWER_MAX_FLOOR;
  const classHeroes = selectedClass ? heroList.filter((h) => h.classId === selectedClass) : [];

  function pickClass(classId: string) {
    setSelectedClass((c) => (c === classId ? null : classId));
    setPicked(null);
    setResult(null);
    setReplayIdx(null);
    setError(null);
  }

  function launch() {
    if (!picked || toppedOut) return;
    setError(null);
    setResult(null);
    setReplayIdx(null);
    climb.mutate(
      { heroId: picked },
      {
        onSuccess: (r) => {
          setResult(r);
          if (r.fight_results.length > 0) setReplayIdx(0);
        },
        onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
      },
    );
  }

  const canLaunch = Boolean(picked) && !toppedOut && !climb.isPending;

  // Verrou de sortie (V1.1) : tant que la refonte n'est pas sortie, teaser + compte à rebours.
  if (!release.released) {
    return <TowerLocked remainingMs={release.remainingMs} version={release.version} />;
  }

  return (
    <section className="anim-fade space-y-5">
      <BackToActivities />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="heading flex items-center gap-2 text-2xl">
            <SyntyImg src={MAP_ART.tower} size={26} />
            Les Tours
          </h2>
          <p className="text-sm text-[var(--color-muted)]">
            Cinq tours, <strong>une par classe</strong> : un seul héros grimpe SA tour, la
            difficulté monte sans cesse. Chaque étage rapporte des matériaux (une seule fois), et
            chaque <strong>palier de boss (tous les 10)</strong> lâche une <strong>gemme</strong>, le
            composant du boss de zone et des <strong>matériaux de relique</strong>.
          </p>
        </div>
        <Link to="/" className="btn btn-ghost text-xs">
          ← Activités
        </Link>
      </div>

      {/* Sélecteur : les 5 tours de classe */}
      <TowerSelector progress={progress} selected={selectedClass} onSelect={pickClass} />

      {!selectedClass ? (
        <p className="panel p-4 text-center text-sm text-[var(--color-muted)]">
          Choisis une tour ci-dessus pour commencer l'ascension.
        </p>
      ) : (
        <>
          <TowerMap
            bestFloor={bestFloor}
            nextFloor={nextFloor}
            toppedOut={toppedOut}
            classLabel={classMeta(selectedClass).label}
          />

          {!toppedOut && (
            <>
              <div>
                <h3 className="mb-2 text-sm font-semibold text-[var(--color-muted)]">
                  Choisis ton grimpeur ({classMeta(selectedClass).label})
                </h3>
                {classHeroes.length === 0 ? (
                  <p className="text-sm text-[var(--color-muted)]">
                    Aucun héros {classMeta(selectedClass).label} — recrutes-en un à la Taverne.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                    {classHeroes.map((h) => {
                      const busy = heroIsBusy(availability.get(h.id));
                      const chosen = picked === h.id;
                      const meta = classMeta(h.classId);
                      return (
                        <button
                          key={h.id}
                          onClick={() => setPicked(chosen ? null : h.id)}
                          disabled={busy}
                          title={busy ? `${h.name} — ${HERO_STATUS_LABEL[availability.get(h.id)!]}` : h.name}
                          className={`panel flex flex-col items-center gap-1 p-2.5 text-center transition ${
                            busy
                              ? 'cursor-not-allowed opacity-40'
                              : chosen
                                ? 'ring-2'
                                : 'opacity-80 hover:opacity-100'
                          }`}
                          style={chosen ? { boxShadow: `0 0 0 2px ${ACCENT}` } : undefined}
                        >
                          <SyntyGlyph src={classWeaponCleanUrl(h.classId)} color={meta.accent} size={30} />
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

              {(error || climb.isError) && (
                <p className="text-sm text-[var(--color-ember)]">
                  {error ?? (climb.error instanceof Error ? climb.error.message : 'Erreur')}
                </p>
              )}

              <button onClick={launch} disabled={!canLaunch} className="btn btn-primary w-full text-sm">
                {climb.isPending
                  ? 'Ascension…'
                  : !picked
                    ? 'Choisis un héros'
                    : `Grimper depuis l'étage ${nextFloor}`}
              </button>
            </>
          )}

          {/* Résultat + replay */}
          {result && replayIdx !== null && result.fight_results[replayIdx] && (
            <TowerReplay
              fights={result.fight_results}
              index={replayIdx}
              onIndex={setReplayIdx}
              onClose={() => setReplayIdx(null)}
            />
          )}
          {result && replayIdx === null && (
            <TowerResult run={result} onReplay={() => result.fight_results.length > 0 && setReplayIdx(0)} />
          )}
        </>
      )}
    </section>
  );
}

/** Teaser affiché tant que la refonte des Tours n'est pas sortie (V1.1). */
function TowerLocked({ remainingMs, version }: { remainingMs: number; version: string | null }) {
  return (
    <section className="anim-fade space-y-5">
      <BackToActivities />
      <div className="panel flex flex-col items-center gap-3 p-8 text-center">
        <SyntyImg src={MAP_ART.tower} size={48} />
        <h2 className="heading text-2xl">Les Tours arrivent</h2>
        <p className="max-w-md text-sm text-[var(--color-muted)]">
          La refonte de la Tour ({version ?? 'V1.1'}) débarque bientôt : 5 tours, une par classe,
          avec gemmes et matériaux de relique aux paliers de boss.
        </p>
        <span className="chip inline-flex items-center gap-1.5 bg-[var(--color-arcane)]/15 text-[var(--color-gold-soft)]">
          🚀 Ouverture dans <span className="tabular-nums font-semibold">{formatCountdown(remainingMs)}</span>
        </span>
      </div>
    </section>
  );
}

/** Sélecteur des 5 tours de classe, avec la progression (meilleur étage) de chacune. */
function TowerSelector({
  progress,
  selected,
  onSelect,
}: {
  progress: Record<string, number>;
  selected: string | null;
  onSelect: (classId: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {TOWER_CLASSES.map((classId) => {
        const meta = classMeta(classId);
        const best = progress[classId] ?? 0;
        const active = selected === classId;
        return (
          <button
            key={classId}
            onClick={() => onSelect(classId)}
            className={`panel flex flex-col items-center gap-1.5 p-3 text-center transition ${
              active ? 'ring-2' : 'opacity-80 hover:opacity-100'
            }`}
            style={active ? { boxShadow: `0 0 0 2px ${meta.accent}` } : undefined}
            title={`Tour des ${meta.label}s`}
          >
            <SyntyGlyph src={classWeaponCleanUrl(classId)} color={meta.accent} size={30} />
            <span className="text-xs font-semibold text-[var(--color-ink)]">{meta.label}</span>
            <span className="text-[10px] font-semibold tabular-nums" style={{ color: meta.accent }}>
              Étage {best}/{TOWER_MAX_FLOOR}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const BOSS = '#f5b544';
const MINI = '#e07a52';

type Tier = {
  t: number;
  from: number;
  to: number;
  boss: boolean;
  material: string;
  conquered: boolean;
  current: boolean;
};

function buildTiers(bestFloor: number, nextFloor: number, toppedOut: boolean): Tier[] {
  // 10 paliers = 10 zones de 10 étages ; chaque zone se termine par un boss (10×Z).
  return Array.from({ length: 10 }, (_, i) => {
    const t = i + 1;
    const to = t * FLOORS_PER_ZONE;
    const from = to - (FLOORS_PER_ZONE - 1);
    return {
      t,
      from,
      to,
      boss: true, // le sommet de chaque zone est un boss (gemme + mats de relique)
      material: towerFloorReward(to).resource,
      conquered: to <= bestFloor,
      current: !toppedOut && nextFloor >= from && nextFloor <= to,
    };
  });
}

/** La Tour : silhouette dessinée (paliers de pierre) + registre des paliers. */
function TowerMap({
  bestFloor,
  nextFloor,
  toppedOut,
  classLabel,
}: {
  bestFloor: number;
  nextFloor: number;
  toppedOut: boolean;
  classLabel: string;
}) {
  const pct = Math.round((bestFloor / TOWER_MAX_FLOOR) * 100);
  const tiers = buildTiers(bestFloor, nextFloor, toppedOut);
  const currentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'center' });
  }, [nextFloor]);

  return (
    <div className="panel relative overflow-hidden p-4">
      <div
        className="pointer-events-none absolute -right-10 -top-16 h-52 w-52 rounded-full opacity-20 blur-3xl"
        style={{ background: ACCENT }}
        aria-hidden
      />

      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="flex h-12 w-12 items-center justify-center rounded-xl"
            style={{ background: `${ACCENT}22` }}
          >
            <SyntyImg src={MAP_ART.tower} size={30} />
          </span>
          <div>
            <div className="font-display text-lg font-bold text-[var(--color-ink)]">
              Tour des {classLabel}s — {toppedOut ? 'sommet atteint !' : `meilleur étage : ${bestFloor}`}
            </div>
            <div className="text-xs text-[var(--color-muted)]">
              {toppedOut ? (
                <>Tu as conquis les {TOWER_MAX_FLOOR} étages de cette tour.</>
              ) : (
                <>
                  Prochaine ascension : <strong style={{ color: ACCENT }}>étage {nextFloor}</strong>
                </>
              )}
            </div>
          </div>
        </div>
        <span className="chip bg-white/5 text-[11px] font-semibold text-[var(--color-ink)]">
          {bestFloor}/{TOWER_MAX_FLOOR}
        </span>
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-black/30">
        <div
          className="h-full rounded-full transition-[width]"
          style={{ width: `${pct}%`, background: ACCENT }}
        />
      </div>

      {/* Tour dessinée + registre des paliers */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[260px_1fr]">
        <div className="mx-auto w-full max-w-[280px]">
          <TowerArt tiers={tiers} bestFloor={bestFloor} nextFloor={nextFloor} toppedOut={toppedOut} />
        </div>

        <div className="max-h-[540px] space-y-1.5 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
          {[...tiers].reverse().map((tier) => (
            <TierCard
              key={tier.t}
              tier={tier}
              nextFloor={nextFloor}
              {...(tier.current ? { cardRef: currentRef } : {})}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- Tour dessinée -- */

const VB_W = 300;
const VB_H = 660;
const CX = 150;
const BASE_Y = 596;
const TOP_Y = 104;
const TIER_H = (BASE_Y - TOP_Y) / 10;
const HALF_BASE = 116;
const HALF_TOP = 60;
const halfAt = (y: number) => HALF_TOP + (HALF_BASE - HALF_TOP) * ((y - TOP_Y) / (BASE_Y - TOP_Y));
const floorY = (f: number) => BASE_Y - (f / TOWER_MAX_FLOOR) * (BASE_Y - TOP_Y);

function starPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(`${(cx + rr * Math.cos(rad)).toFixed(1)},${(cy + rr * Math.sin(rad)).toFixed(1)}`);
  }
  return pts.join(' ');
}

const STARS = [
  [30, 60],
  [70, 120],
  [255, 80],
  [220, 150],
  [40, 200],
  [270, 230],
  [20, 320],
  [285, 350],
  [255, 300],
  [45, 130],
];

function TowerArt({
  tiers,
  bestFloor,
  nextFloor,
  toppedOut,
}: {
  tiers: Tier[];
  bestFloor: number;
  nextFloor: number;
  toppedOut: boolean;
}) {
  const spireHalf = halfAt(TOP_Y);
  const markerY = floorY(nextFloor);

  return (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="h-auto w-full" role="img" aria-label="La Tour">
      <defs>
        <linearGradient id="tw-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0f0820" />
          <stop offset="55%" stopColor="#1a1030" />
          <stop offset="100%" stopColor="#241a3c" />
        </linearGradient>
        <linearGradient id="tw-cold" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#211d33" />
          <stop offset="50%" stopColor="#332e4c" />
          <stop offset="100%" stopColor="#1c1830" />
        </linearGradient>
        <linearGradient id="tw-lit" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#5a4527" />
          <stop offset="50%" stopColor="#846438" />
          <stop offset="100%" stopColor="#4a3a22" />
        </linearGradient>
        <linearGradient id="tw-cur" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#463774" />
          <stop offset="50%" stopColor="#6f55ad" />
          <stop offset="100%" stopColor="#3a2d5e" />
        </linearGradient>
        <linearGradient id="tw-spire" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffd98a" />
          <stop offset="100%" stopColor="#b8842f" />
        </linearGradient>
        <radialGradient id="tw-door" cx="0.5" cy="0.2" r="0.9">
          <stop offset="0%" stopColor="#ffcf7a" />
          <stop offset="100%" stopColor="#5a3d1a" />
        </radialGradient>
        <filter id="tw-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Ciel + étoiles + lune */}
      <rect x="0" y="0" width={VB_W} height={VB_H} fill="url(#tw-sky)" />
      {STARS.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 1.6 : 1} fill="#fff" opacity={0.5} />
      ))}
      <circle cx="250" cy="70" r="26" fill="#efe7c9" opacity="0.18" />

      {/* Sol */}
      <ellipse cx={CX} cy={BASE_Y + 10} rx={HALF_BASE + 26} ry="18" fill="#0c0718" opacity="0.9" />

      {/* Paliers empilés (bas → haut) */}
      {tiers.map((tier) => {
        const yb = BASE_Y - (tier.t - 1) * TIER_H;
        const yt = BASE_Y - tier.t * TIER_H;
        const hb = halfAt(yb);
        const ht = halfAt(yt);
        const fill = tier.conquered ? 'url(#tw-lit)' : tier.current ? 'url(#tw-cur)' : 'url(#tw-cold)';
        const emblemColor = tier.boss ? BOSS : MINI;
        const wy = (yb + yt) / 2;
        const wh = halfAt(wy);
        return (
          <g key={tier.t}>
            {/* Bloc du palier */}
            <polygon
              points={`${CX - hb},${yb} ${CX + hb},${yb} ${CX + ht},${yt} ${CX - ht},${yt}`}
              fill={fill}
              stroke="#00000055"
              strokeWidth="1.5"
            />
            {/* Fenêtres */}
            {[-1, 1].map((s) => (
              <rect
                key={s}
                x={CX + s * wh * 0.42 - 4}
                y={wy - 7}
                width="8"
                height="14"
                rx="1.5"
                fill={tier.conquered ? '#ffce6b' : '#0d0a1a'}
                opacity={tier.conquered ? 0.95 : 0.6}
                filter={tier.conquered ? 'url(#tw-glow)' : undefined}
              />
            ))}
            {/* Corniche crénelée au sommet du palier */}
            <rect x={CX - ht - 5} y={yt - 7} width={2 * ht + 10} height="8" fill="#00000066" />
            {[-2, -1, 0, 1, 2].map((k) => (
              <rect key={k} x={CX + k * ((ht + 3) / 2.6) - 3} y={yt - 12} width="6" height="6" fill="#00000066" />
            ))}
            {/* Emblème de capstone (boss / mini-boss) */}
            {tier.boss ? (
              <polygon
                points={starPoints(CX, yt - 4, 9)}
                fill={emblemColor}
                stroke="#1a1523"
                strokeWidth="1"
                filter="url(#tw-glow)"
              />
            ) : (
              <polygon
                points={`${CX},${yt - 12} ${CX + 7},${yt - 4} ${CX},${yt + 4} ${CX - 7},${yt - 4}`}
                fill={emblemColor}
                stroke="#1a1523"
                strokeWidth="1"
              />
            )}
          </g>
        );
      })}

      {/* Flèche / toit du sommet */}
      <polygon
        points={`${CX},${TOP_Y - 56} ${CX + spireHalf + 4},${TOP_Y} ${CX - spireHalf - 4},${TOP_Y}`}
        fill="url(#tw-spire)"
        stroke="#00000055"
        strokeWidth="1.5"
      />
      <line x1={CX} y1={TOP_Y - 56} x2={CX} y2={TOP_Y - 78} stroke="#d8b45a" strokeWidth="2" />
      <polygon points={`${CX},${TOP_Y - 78} ${CX + 20},${TOP_Y - 72} ${CX},${TOP_Y - 66}`} fill={ACCENT} />

      {/* Porte lumineuse à la base */}
      <path
        d={`M ${CX - 16} ${BASE_Y} L ${CX - 16} ${BASE_Y - 22} Q ${CX} ${BASE_Y - 40} ${CX + 16} ${BASE_Y - 22} L ${CX + 16} ${BASE_Y} Z`}
        fill="url(#tw-door)"
        stroke="#2a1c0c"
        strokeWidth="2"
      />

      {/* Torches à la base */}
      {[-1, 1].map((s) => (
        <g key={s}>
          <circle cx={CX + s * 34} cy={BASE_Y - 26} r="6" fill="#ffb648" filter="url(#tw-glow)" />
          <rect x={CX + s * 34 - 1.5} y={BASE_Y - 26} width="3" height="18" fill="#3a2a16" />
        </g>
      ))}

      {/* Marqueur « tu es ici » au prochain étage (flèche adaptée à la largeur) */}
      {!toppedOut &&
        (() => {
          const edge = CX - halfAt(markerY);
          return (
            <g filter="url(#tw-glow)">
              <polygon
                points={`${edge - 6},${markerY} ${edge - 22},${markerY - 7} ${edge - 22},${markerY + 7}`}
                fill={ACCENT}
              />
            </g>
          );
        })()}

      {/* Ligne de conquête (front actuel) */}
      {bestFloor > 0 && !toppedOut && (
        <line
          x1={CX - halfAt(floorY(bestFloor)) - 6}
          x2={CX + halfAt(floorY(bestFloor)) + 6}
          y1={floorY(bestFloor)}
          y2={floorY(bestFloor)}
          stroke="#ffce6b"
          strokeWidth="2"
          strokeDasharray="4 3"
          opacity="0.8"
        />
      )}
    </svg>
  );
}

/* ------------------------------------------------------ Registre paliers -- */

function TierCard({
  tier,
  nextFloor,
  cardRef,
}: {
  tier: Tier;
  nextFloor: number;
  cardRef?: React.RefObject<HTMLDivElement>;
}) {
  const color = BOSS;
  const lo = 2 + tier.from;
  const hi = 2 + tier.to;
  const gem = bossGem(tier.to);

  return (
    <div
      ref={cardRef}
      className="flex items-center gap-3 rounded-lg border px-3 py-2 transition"
      style={{
        borderColor: tier.current ? color : `${color}44`,
        background: tier.current ? `${color}1c` : 'rgba(255,255,255,0.02)',
        opacity: tier.conquered ? 0.55 : 1,
        ...(tier.current ? { boxShadow: `0 0 0 1px ${color}, 0 0 16px -6px ${color}` } : {}),
      }}
    >
      {/* Bande d'étages */}
      <span
        className="flex shrink-0 flex-col items-center justify-center rounded-md px-2 py-1 font-display font-bold leading-none tabular-nums"
        style={{ background: `${color}22`, color }}
      >
        <span className="text-sm">
          {tier.from}–{tier.to}
        </span>
        <span className="mt-0.5 text-[8px] font-semibold uppercase tracking-wide opacity-80">étages</span>
      </span>

      {/* Zone + matériau de farm + récompense de boss (gemme) */}
      <div className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color }}>
          <UiIcon name="dragon" size={14} color={color} />
          Boss de zone · étage {tier.to}
        </span>
        <span className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--color-ink)]/80">
          <ResourceIcon resKey={tier.material} size={13} />
          <span className="font-semibold text-[var(--color-gold-soft)]">
            +{lo}→+{hi}
          </span>
          <span className="truncate text-[var(--color-muted)]">{resourceMeta(tier.material).label}</span>
        </span>
        {gem && (
          <span className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--color-ink)]/80">
            <ResourceIcon resKey={gem} size={13} />
            <span className="font-semibold" style={{ color: BOSS }}>
              Gemme + mats de relique
            </span>
          </span>
        )}
      </div>

      {/* État */}
      {tier.conquered ? (
        <UiIcon name="victory" size={15} color="#5fd39b" />
      ) : tier.current ? (
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide"
          style={{ background: color, color: '#1a1523' }}
        >
          Étage {nextFloor}
        </span>
      ) : (
        <UiIcon name="lock" size={13} color="var(--color-muted)" />
      )}
    </div>
  );
}

function TowerResult({ run, onReplay }: { run: TowerClimbResponse; onReplay: () => void }) {
  const gained = run.cleared_new > 0;
  return (
    <div className="panel anim-pop space-y-3 p-4">
      <span
        className={`flex items-center gap-1.5 font-display text-lg font-bold ${
          gained ? 'text-[var(--color-gold)]' : 'text-[var(--color-ember)]'
        }`}
      >
        <UiIcon name={gained ? 'victory' : 'defeat'} size={20} color="currentColor" />
        {run.topped_out
          ? `Sommet conquis — étage ${run.reached_floor} !`
          : gained
            ? `+${run.cleared_new} étage(s) — arrêt à l'étage ${run.reached_floor}`
            : `Bloqué à l'étage ${run.from_floor}`}
      </span>

      {run.loot.length > 0 ? (
        <div className="flex flex-wrap gap-2 text-xs">
          {run.loot.map((d) => (
            <span
              key={d.resource}
              className="chip inline-flex items-center gap-1 bg-white/5 text-[var(--color-ink)]"
            >
              <ResourceIcon resKey={d.resource} /> +{d.amount} {resourceMeta(d.resource).label}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-[var(--color-muted)]">
          Aucun nouvel étage franchi — renforce ton héros et retente l'ascension.
        </p>
      )}

      {run.fight_results.length > 0 && (
        <button onClick={onReplay} className="btn btn-arcane w-full text-sm">
          ▶ Revoir l'ascension ({run.fight_results.length} combat
          {run.fight_results.length > 1 ? 's' : ''})
        </button>
      )}
    </div>
  );
}

function TowerReplay({
  fights,
  index,
  onIndex,
  onClose,
}: {
  fights: TowerFightResult[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const fight = fights[index]!;
  const hasNext = index < fights.length - 1;
  const lost = fight.combat.result === 'loss';
  return (
    <CombatReplay
      key={index}
      combat={toStored(fight.combat)}
      enemyKind={replayKind(fight.kind)}
      onClose={onClose}
      title={`Étage ${fight.floor} — ${fight.enemyName}`}
      footer={
        <div className="mt-3 flex items-center justify-center gap-2">
          <button
            onClick={() => index > 0 && onIndex(index - 1)}
            disabled={index === 0}
            className="btn btn-ghost text-xs disabled:opacity-40"
          >
            ◀ Étage précédent
          </button>
          {hasNext && !lost ? (
            <button onClick={() => onIndex(index + 1)} className="btn btn-primary text-xs">
              Étage suivant ▶
            </button>
          ) : (
            <button onClick={onClose} className="btn btn-primary text-xs">
              Voir le bilan
            </button>
          )}
        </div>
      }
    />
  );
}
