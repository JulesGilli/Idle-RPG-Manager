import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FavStar } from '@/components/FavoriteStar';
import { useHeroes } from '@/features/heroes/useHeroes';
import {
  useHeroAvailability,
  heroIsBusy,
  HERO_STATUS_LABEL,
} from '@/features/heroes/useHeroAvailability';
import { classMeta } from '@/lib/gameUi';
import { classWeaponCleanUrl, syntyUrl } from '@/lib/synty';
import { SyntyGlyph } from '@/components/synty/SyntyIcon';
import { UiIcon } from '@/components/synty/GameIcons';
import { BackToActivities } from '@/components/BackToActivities';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { resourceMeta } from '@/hooks/useResources';
import { CombatReplay, type StoredCombat } from '@/components/CombatReplay';
import { ETERNITY_RESOURCE, ETERNITY_PRODUCTION_TIERS } from '@shared/progression/gauntlet';
import {
  useGauntletState,
  useClaimEternity,
  useRunGauntlet,
  type GauntletRunResponse,
  type GauntletWaveResult,
  type GauntletCombat,
} from './useGauntlet';

const ACCENT = '#c084fc';
const GOLD = '#f5b544';
const MAX_TEAM = 5;
/** Délai avant l'enchaînement auto vers la vague suivante. */
const AUTO_NEXT_MS = 4000;

function toStored(c: GauntletCombat): StoredCombat {
  return { rounds: c.rounds, result: c.result, events: c.events, final_state: c.finalState };
}

/** Prochain palier de rente (pour montrer au joueur ce qu'il vise). */
function nextTier(bestWave: number): { wave: number; perDay: number } | null {
  return ETERNITY_PRODUCTION_TIERS.find((t) => t.wave > bestWave) ?? null;
}

export function GauntletScreen() {
  const { data: heroes } = useHeroes();
  const availability = useHeroAvailability();
  const state = useGauntletState();
  const claim = useClaimEternity();
  const run = useRunGauntlet();

  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<GauntletRunResponse | null>(null);
  const [replayIdx, setReplayIdx] = useState<number | null>(null);
  const [auto, setAuto] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const heroList = heroes ?? [];
  const bestWave = state.data?.best_wave ?? 0;
  const perDay = state.data?.per_day ?? 0;
  const pending = state.data?.pending ?? 0;
  const next = nextTier(bestWave);

  function toggleHero(heroId: string) {
    setResult(null);
    setReplayIdx(null);
    setError(null);
    setPicked((cur) => {
      if (cur.includes(heroId)) return cur.filter((h) => h !== heroId);
      if (cur.length >= MAX_TEAM) return cur;
      return [...cur, heroId];
    });
  }

  function launch() {
    if (picked.length === 0) return;
    setError(null);
    setResult(null);
    setReplayIdx(null);
    run.mutate(picked, {
      onSuccess: (r) => {
        setResult(r);
        if (r.wave_results.length > 0) setReplayIdx(0);
      },
      onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
    });
  }

  const canLaunch = picked.length > 0 && !run.isPending;

  return (
    <section className="anim-fade space-y-5">
      <BackToActivities />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="heading flex items-center gap-2 text-2xl">
            <SyntyGlyph src={syntyUrl.inv('Swords01')} size={26} color={ACCENT} />
            Le Gauntlet
          </h2>
          <p className="max-w-2xl text-sm text-[var(--color-muted)]">
            L'Arène d'Éternité : des <strong>vagues sans fin</strong>, de plus en plus fortes, à PV
            pleins à chaque vague. La course s'arrête à la première défaite — seule ta{' '}
            <strong>meilleure vague</strong> compte. Plus loin tu plantes ton étendard, plus haute
            est ta <strong>rente quotidienne d'{resourceMeta(ETERNITY_RESOURCE).label}</strong>,
            l'unique ressource qui <strong>renforce les armes divines</strong> (100 % de réussite).
          </p>
        </div>
        <Link to="/" className="btn btn-ghost text-xs">
          ← Activités
        </Link>
      </div>

      {/* ══════════ L'ARÈNE D'ÉTERNITÉ — scène + rente + paliers ══════════ */}
      <EternityShrine
        bestWave={bestWave}
        perDay={perDay}
        pending={pending}
        next={next}
        loading={state.isLoading}
        claiming={claim.isPending}
        onClaim={() =>
          claim.mutate(undefined, {
            onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
          })
        }
      />

      {/* Sélection d'escouade */}
      <div>
        <h3 className="mb-2 flex items-center justify-between text-sm font-semibold text-[var(--color-muted)]">
          <span>Ton escouade</span>
          <span className="tabular-nums" style={{ color: ACCENT }}>
            {picked.length}/{MAX_TEAM}
          </span>
        </h3>
        {heroList.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">
            Aucun héros — recrutes-en à la Taverne.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {heroList.map((h) => {
              const heroBusy = heroIsBusy(availability.get(h.id));
              const busy = heroBusy || run.isPending;
              const chosen = picked.includes(h.id);
              const full = !chosen && picked.length >= MAX_TEAM;
              const meta = classMeta(h.classId);
              return (
                <button
                  key={h.id}
                  onClick={() => toggleHero(h.id)}
                  disabled={busy || full}
                  title={
                    heroBusy
                      ? `${h.name} — ${HERO_STATUS_LABEL[availability.get(h.id)!]}`
                      : full
                        ? 'Escouade complète'
                        : h.name
                  }
                  className={`panel flex flex-col items-center gap-1 p-2.5 text-center transition ${
                    busy || full
                      ? 'cursor-not-allowed opacity-40'
                      : chosen
                        ? 'ring-2'
                        : 'opacity-80 hover:opacity-100'
                  }`}
                  style={chosen ? { boxShadow: `0 0 0 2px ${ACCENT}` } : undefined}
                >
                  <SyntyGlyph src={classWeaponCleanUrl(h.classId)} color={meta.accent} size={30} />
                  <span className="w-full truncate text-xs font-medium text-[var(--color-ink)]">
                    <FavStar on={h.favorite} />
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

      {(error || run.isError) && (
        <p className="text-sm text-[var(--color-ember)]">
          {error ?? (run.error instanceof Error ? run.error.message : 'Erreur')}
        </p>
      )}

      <button onClick={launch} disabled={!canLaunch} className="btn btn-primary w-full text-sm">
        {run.isPending
          ? 'Course en cours…'
          : picked.length === 0
            ? 'Choisis ton escouade'
            : '⚔ Franchir les portes'}
      </button>

      {/* Résultat + replay */}
      {result && replayIdx !== null && result.wave_results[replayIdx] && (
        <GauntletReplay
          waves={result.wave_results}
          index={replayIdx}
          onIndex={setReplayIdx}
          onClose={() => setReplayIdx(null)}
          auto={auto}
          onToggleAuto={() => setAuto((v) => !v)}
        />
      )}
      {result && replayIdx === null && (
        <GauntletResult
          run={result}
          onReplay={() => result.wave_results.length > 0 && setReplayIdx(0)}
        />
      )}
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   L'ARÈNE D'ÉTERNITÉ — panneau-héros : la scène dessinée, la rente et la piste
   des paliers. Illustration SVG animée (SMIL, comme la Tour et le panneau de
   quêtes) : éclipse d'éternité, couloir de portes qui recule vers le portail,
   colosses d'obsidienne, braises, éclairs — et l'étendard du record du joueur.
   ═══════════════════════════════════════════════════════════════════════ */

function EternityShrine({
  bestWave,
  perDay,
  pending,
  next,
  loading,
  claiming,
  onClaim,
}: {
  bestWave: number;
  perDay: number;
  pending: number;
  next: { wave: number; perDay: number } | null;
  loading: boolean;
  claiming: boolean;
  onClaim: () => void;
}) {
  const eternityLabel = resourceMeta(ETERNITY_RESOURCE).label;
  return (
    <div className="panel overflow-hidden p-0">
      {/* Scène */}
      <div className="relative">
        <ArenaScene bestWave={bestWave} />
        {/* Scrim bas pour asseoir la barre de stats sur la scène */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[var(--color-panel)] to-transparent" />
        {/* Record gravé dans la pierre, en haut à gauche de la scène */}
        <div className="absolute left-4 top-3 sm:left-6 sm:top-5">
          <div
            className="font-display text-[10px] font-bold uppercase tracking-[0.25em]"
            style={{ color: `${GOLD}cc` }}
          >
            Meilleure vague
          </div>
          <div
            className="font-display text-4xl font-black leading-none sm:text-5xl"
            style={{ color: GOLD, textShadow: `0 0 24px ${GOLD}66, 0 2px 0 #00000088` }}
          >
            {loading ? '…' : bestWave}
          </div>
        </div>
        {/* Rente, en haut à droite */}
        <div className="absolute right-4 top-3 text-right sm:right-6 sm:top-5">
          <div
            className="font-display text-[10px] font-bold uppercase tracking-[0.25em]"
            style={{ color: `${ACCENT}cc` }}
          >
            Rente d'Éternité
          </div>
          <div className="flex items-center justify-end gap-1.5">
            <ResourceIcon resKey={ETERNITY_RESOURCE} size={22} />
            <span
              className="font-display text-3xl font-black leading-none sm:text-4xl"
              style={{ color: ACCENT, textShadow: `0 0 24px ${ACCENT}66, 0 2px 0 #00000088` }}
            >
              {loading ? '…' : perDay}
            </span>
            <span className="mb-0.5 self-end text-[11px] font-bold text-[var(--color-muted)]">
              /jour
            </span>
          </div>
        </div>
      </div>

      {/* Barre rente + encaissement */}
      <div className="flex flex-wrap items-center gap-3 px-4 pb-3 pt-1 sm:px-5">
        <div className="min-w-0 flex-1 text-xs text-[var(--color-muted)]">
          {next ? (
            <>
              Prochain palier : plante ton étendard à la{' '}
              <strong style={{ color: GOLD }}>vague {next.wave}</strong> →{' '}
              <strong style={{ color: ACCENT }}>{next.perDay}</strong> {eternityLabel}/jour.
            </>
          ) : (
            <>
              <strong style={{ color: GOLD }}>Rente maximale atteinte.</strong> L'arène s'incline.
            </>
          )}
        </div>
        <button
          onClick={onClaim}
          disabled={claiming || pending <= 0}
          className="btn btn-arcane shrink-0 text-sm disabled:opacity-40"
        >
          {claiming ? (
            'Encaissement…'
          ) : pending > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <ResourceIcon resKey={ETERNITY_RESOURCE} size={15} />
              Encaisser {pending}
            </span>
          ) : (
            'Rien à encaisser'
          )}
        </button>
      </div>

      {/* Piste des paliers de rente */}
      <TierTrack bestWave={bestWave} />
    </div>
  );
}

/** Piste horizontale des paliers de production (conquis / visé / à venir). */
function TierTrack({ bestWave }: { bestWave: number }) {
  const target = ETERNITY_PRODUCTION_TIERS.find((t) => t.wave > bestWave)?.wave ?? null;
  return (
    <div className="border-t border-[var(--color-edge)] px-4 py-3 sm:px-5">
      <div className="flex items-stretch gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
        {ETERNITY_PRODUCTION_TIERS.map((t) => {
          const conquered = bestWave >= t.wave;
          const current = t.wave === target;
          return (
            <div
              key={t.wave}
              title={`Vague ${t.wave} atteinte → ${t.perDay} ${resourceMeta(ETERNITY_RESOURCE).label}/jour`}
              className="flex min-w-[72px] flex-1 flex-col items-center rounded-lg border px-2 py-1.5 text-center transition"
              style={{
                borderColor: conquered ? `${GOLD}66` : current ? ACCENT : 'var(--color-edge)',
                background: conquered ? `${GOLD}14` : current ? `${ACCENT}14` : 'rgba(255,255,255,0.02)',
                opacity: conquered || current ? 1 : 0.55,
                ...(current ? { boxShadow: `0 0 12px -4px ${ACCENT}` } : {}),
              }}
            >
              <span
                className="text-[9px] font-bold uppercase tracking-wide"
                style={{ color: conquered ? GOLD : current ? ACCENT : 'var(--color-muted)' }}
              >
                {conquered ? '★' : current ? '▸' : ''} Vague {t.wave}
              </span>
              <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-bold tabular-nums text-[var(--color-ink)]">
                <ResourceIcon resKey={ETERNITY_RESOURCE} size={12} />
                {t.perDay}/j
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────── la scène dessinée (SVG) ── */

const VB_W = 1360;
const VB_H = 470;
const VPX = 680; // point de fuite (centre du portail)
const VPY = 288;

/** Profondeur d'une porte k (0 = la plus proche) → facteur d'échelle [1 → 0]. */
function gateDepth(k: number, count: number): number {
  return Math.pow(1 - k / count, 1.85);
}

/** Braises montantes : [x, yBase, rayon, durée s, retard s]. */
const EMBERS: [number, number, number, number, number][] = [
  [180, 430, 2.2, 6, 0], [265, 445, 1.5, 8, 3], [420, 452, 1.8, 7, 1.5],
  [530, 438, 1.3, 9, 5], [660, 450, 2.0, 6.5, 2], [755, 442, 1.4, 8.5, 4.5],
  [880, 452, 1.9, 7.5, 0.8], [1005, 440, 1.4, 6.8, 3.6], [1130, 448, 2.1, 8, 2.4],
  [1230, 435, 1.5, 7, 5.4], [340, 444, 1.2, 9.5, 6.2], [960, 446, 1.2, 9, 1.2],
];

/** Étoiles du vide : [x, y, r]. */
const STARS: [number, number, number][] = [
  [60, 40, 1.4], [150, 90, 1], [240, 30, 1.2], [330, 70, 0.9], [430, 45, 1.3],
  [520, 100, 0.9], [840, 95, 1], [930, 40, 1.3], [1030, 75, 1], [1120, 35, 1.4],
  [1210, 90, 1], [1300, 50, 1.2], [90, 150, 0.9], [1270, 150, 0.9], [590, 35, 1],
  [770, 30, 1],
];

export function ArenaScene({ bestWave }: { bestWave: number }) {
  const GATES = 9;
  // L'étendard du record, planté dans le couloir (50 vagues = l'horizon).
  const frac = Math.max(0, Math.min(1, bestWave / 50));
  const standardDepth = Math.pow(1 - frac, 1.85);
  const standardY = VPY + 164 * standardDepth;
  const standardX = VPX - (36 + 330 * standardDepth) * 0.62;
  const standardH = 26 + 96 * standardDepth;

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      className="h-auto w-full"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="L'Arène d'Éternité — le couloir des vagues sans fin"
    >
      <defs>
        <linearGradient id="ga-void" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#050310" />
          <stop offset="45%" stopColor="#120a2b" />
          <stop offset="80%" stopColor="#251345" />
          <stop offset="100%" stopColor="#33194f" />
        </linearGradient>
        <linearGradient id="ga-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2a1747" />
          <stop offset="30%" stopColor="#1c0f33" />
          <stop offset="100%" stopColor="#0c0618" />
        </linearGradient>
        <radialGradient id="ga-portal" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#fff3d6" />
          <stop offset="28%" stopColor="#ffd98a" />
          <stop offset="55%" stopColor="#b06ef0" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#b06ef0" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="ga-halo" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#c084fc" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#c084fc" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ga-eclipse" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffd98a" />
          <stop offset="50%" stopColor="#f5b544" />
          <stop offset="100%" stopColor="#c084fc" />
        </linearGradient>
        <linearGradient id="ga-flame" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#ff7a2a" />
          <stop offset="60%" stopColor="#ffb03a" />
          <stop offset="100%" stopColor="#ffe58a" />
        </linearGradient>
        <filter id="ga-glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="ga-glow-lg" x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur stdDeviation="7" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* ── Ciel du vide ─────────────────────────────────────────────── */}
      <rect x="0" y="0" width={VB_W} height={VB_H} fill="url(#ga-void)" />
      {STARS.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="#fff" opacity="0.55">
          <animate
            attributeName="opacity"
            values="0.25;0.7;0.25"
            dur={`${3 + (i % 5)}s`}
            begin={`-${i * 0.7}s`}
            repeatCount="indefinite"
          />
        </circle>
      ))}

      {/* Éclipse d'Éternité, couronne du ciel */}
      <circle cx={VPX} cy={112} r={104} fill="url(#ga-halo)" />
      <circle cx={VPX} cy={112} r={64} fill="#060312" />
      <circle cx={VPX} cy={112} r={64} fill="none" stroke="url(#ga-eclipse)" strokeWidth="3.5" filter="url(#ga-glow-lg)" />
      {/* Anneau runique en rotation lente autour de l'éclipse */}
      <g>
        <circle
          cx={VPX}
          cy={112}
          r={82}
          fill="none"
          stroke={GOLD}
          strokeWidth="1.4"
          strokeDasharray="3 14"
          opacity="0.7"
        />
        <animateTransform
          attributeName="transform"
          type="rotate"
          from={`0 ${VPX} 112`}
          to={`360 ${VPX} 112`}
          dur="60s"
          repeatCount="indefinite"
        />
      </g>
      {/* Rais de lumière de l'éclipse vers le portail */}
      <polygon points={`${VPX - 10},176 ${VPX + 10},176 ${VPX + 42},${VPY} ${VPX - 42},${VPY}`} fill={GOLD} opacity="0.06" />
      <polygon points={`${VPX - 30},176 ${VPX - 14},176 ${VPX - 90},${VPY} ${VPX - 130},${VPY}`} fill={ACCENT} opacity="0.05" />
      <polygon points={`${VPX + 14},176 ${VPX + 30},176 ${VPX + 130},${VPY} ${VPX + 90},${VPY}`} fill={ACCENT} opacity="0.05" />

      {/* Éclairs du vide (pulsations lentes) */}
      <polyline
        points="150,12 176,58 158,66 196,124 180,128 214,178"
        fill="none"
        stroke={ACCENT}
        strokeWidth="2"
        opacity="0"
        filter="url(#ga-glow)"
      >
        <animate attributeName="opacity" values="0;0;0.8;0.1;0.5;0;0" keyTimes="0;0.86;0.88;0.9;0.92;0.94;1" dur="9s" repeatCount="indefinite" />
      </polyline>
      <polyline
        points="1216,8 1190,52 1206,60 1170,116 1186,120 1152,168"
        fill="none"
        stroke="#8ab0ff"
        strokeWidth="2"
        opacity="0"
        filter="url(#ga-glow)"
      >
        <animate attributeName="opacity" values="0;0;0.7;0.1;0.4;0;0" keyTimes="0;0.55;0.57;0.59;0.61;0.63;1" dur="12s" begin="-4s" repeatCount="indefinite" />
      </polyline>

      {/* Gradins ruinés à l'horizon */}
      <path
        d={`M0,${VPY - 34} L90,${VPY - 58} L140,${VPY - 40} L220,${VPY - 66} L300,${VPY - 44} L380,${VPY - 60} L460,${VPY - 38} L540,${VPY - 52} L600,${VPY - 34} L0,${VPY - 10} Z`}
        fill="#160b2c"
      />
      <path
        d={`M${VB_W},${VPY - 34} L${VB_W - 90},${VPY - 58} L${VB_W - 140},${VPY - 40} L${VB_W - 220},${VPY - 66} L${VB_W - 300},${VPY - 44} L${VB_W - 380},${VPY - 60} L${VB_W - 460},${VPY - 38} L${VB_W - 540},${VPY - 52} L${VB_W - 600},${VPY - 34} L${VB_W},${VPY - 10} Z`}
        fill="#160b2c"
      />

      {/* ── Sol de l'arène ───────────────────────────────────────────── */}
      <rect x="0" y={VPY} width={VB_W} height={VB_H - VPY} fill="url(#ga-floor)" />
      {/* Rayons de perspective */}
      {[-160, 60, 280, 500, 860, 1080, 1300, 1520].map((bx, i) => (
        <line key={i} x1={VPX} y1={VPY} x2={bx} y2={VB_H} stroke="#c084fc" strokeWidth="1" opacity="0.07" />
      ))}
      {/* Dalles transversales (arcs de cercle du couloir) */}
      {[0.12, 0.3, 0.52, 0.78].map((t, i) => {
        const y = VPY + (VB_H - VPY) * t;
        const half = 120 + 620 * t;
        return (
          <path
            key={i}
            d={`M ${VPX - half} ${VB_H} Q ${VPX} ${y} ${VPX + half} ${VB_H}`}
            fill="none"
            stroke="#000"
            strokeWidth="1.5"
            opacity="0.25"
          />
        );
      })}
      {/* Failles ardentes du sol */}
      <polyline points={`300,${VB_H} 356,412 338,394 392,352`} fill="none" stroke={ACCENT} strokeWidth="2" opacity="0.5" filter="url(#ga-glow)">
        <animate attributeName="opacity" values="0.3;0.65;0.3" dur="5s" repeatCount="indefinite" />
      </polyline>
      <polyline points={`1080,${VB_H} 1020,408 1042,388 996,348`} fill="none" stroke={GOLD} strokeWidth="2" opacity="0.4" filter="url(#ga-glow)">
        <animate attributeName="opacity" values="0.25;0.55;0.25" dur="6.5s" begin="-2s" repeatCount="indefinite" />
      </polyline>

      {/* ── Le portail, au bout du couloir ───────────────────────────── */}
      <ellipse cx={VPX} cy={VPY} rx={120} ry={26} fill={ACCENT} opacity="0.16" filter="url(#ga-glow-lg)" />
      <circle cx={VPX} cy={VPY - 26} r={56} fill="url(#ga-portal)">
        <animate attributeName="r" values="52;58;52" dur="5s" repeatCount="indefinite" />
      </circle>
      {/* Vortex : trois anneaux en contre-rotation */}
      {[
        { r: 34, w: 2.5, dash: '10 8', dur: 9, dir: 1, col: '#ffe6b8' },
        { r: 44, w: 1.8, dash: '4 10', dur: 14, dir: -1, col: ACCENT },
        { r: 52, w: 1.2, dash: '2 12', dur: 22, dir: 1, col: '#8ab0ff' },
      ].map((ring, i) => (
        <g key={i}>
          <circle
            cx={VPX}
            cy={VPY - 26}
            r={ring.r}
            fill="none"
            stroke={ring.col}
            strokeWidth={ring.w}
            strokeDasharray={ring.dash}
            opacity="0.85"
            filter="url(#ga-glow)"
          />
          <animateTransform
            attributeName="transform"
            type="rotate"
            from={`0 ${VPX} ${VPY - 26}`}
            to={`${360 * ring.dir} ${VPX} ${VPY - 26}`}
            dur={`${ring.dur}s`}
            repeatCount="indefinite"
          />
        </g>
      ))}
      {/* Sigil ∞ au cœur du portail */}
      <g filter="url(#ga-glow)" opacity="0.95">
        <circle cx={VPX - 9} cy={VPY - 26} r={8} fill="none" stroke="#1a0f2e" strokeWidth="3.5" />
        <circle cx={VPX + 9} cy={VPY - 26} r={8} fill="none" stroke="#1a0f2e" strokeWidth="3.5" />
      </g>

      {/* ── Le couloir des portes ────────────────────────────────────── */}
      {Array.from({ length: GATES }, (_, i) => GATES - 1 - i).map((k) => {
        const d = gateDepth(k, GATES);
        const half = 36 + 330 * d;
        const h = 52 + 268 * d;
        const yb = VPY + 164 * d;
        const r = half * 0.55;
        const boss = k % 3 === 0;
        const col = boss ? GOLD : ACCENT;
        const sw = 1.2 + 6 * d;
        const yt = yb - h;
        return (
          <g key={k} opacity={0.35 + 0.65 * d}>
            {/* Montants + arche */}
            <path
              d={`M ${VPX - half} ${yb} L ${VPX - half} ${yt + r} Q ${VPX - half} ${yt} ${VPX - half + r} ${yt} L ${VPX + half - r} ${yt} Q ${VPX + half} ${yt} ${VPX + half} ${yt + r} L ${VPX + half} ${yb}`}
              fill="none"
              stroke={col}
              strokeWidth={sw}
              filter={d > 0.35 ? 'url(#ga-glow)' : undefined}
              opacity="0.9"
            />
            {/* Socles */}
            <rect x={VPX - half - sw * 1.6} y={yb - sw * 2} width={sw * 3.2} height={sw * 2.4} fill="#0c0618" stroke={col} strokeWidth="1" opacity="0.9" />
            <rect x={VPX + half - sw * 1.6} y={yb - sw * 2} width={sw * 3.2} height={sw * 2.4} fill="#0c0618" stroke={col} strokeWidth="1" opacity="0.9" />
            {/* Clé de voûte : étoile (porte de boss) ou gemme */}
            {boss ? (
              <polygon
                points={`${VPX},${yt - 10 * d - 8} ${VPX + 6 * d + 3},${yt - 2} ${VPX},${yt + 6 * d + 2} ${VPX - 6 * d - 3},${yt - 2}`}
                fill={GOLD}
                stroke="#1a0f2e"
                strokeWidth="1"
                filter="url(#ga-glow)"
              />
            ) : (
              <circle cx={VPX} cy={yt - 2} r={2 + 4 * d} fill={ACCENT} filter="url(#ga-glow)" opacity="0.9" />
            )}
          </g>
        );
      })}

      {/* ── L'étendard du record, planté dans le couloir ─────────────── */}
      {bestWave > 0 && (
        <g filter="url(#ga-glow)">
          <line x1={standardX} y1={standardY} x2={standardX} y2={standardY - standardH} stroke="#e8d9b0" strokeWidth={1.6 + 2 * standardDepth} />
          <polygon
            points={`${standardX},${standardY - standardH} ${standardX + 30 * standardDepth + 12},${standardY - standardH + 7 * standardDepth + 3} ${standardX},${standardY - standardH + 14 * standardDepth + 6}`}
            fill={GOLD}
          />
          {/* Flamme au sommet */}
          <path
            d={`M ${standardX} ${standardY - standardH - 12 * standardDepth - 5} q ${-4 * standardDepth - 2} ${6 * standardDepth + 3} 0 ${10 * standardDepth + 4} q ${4 * standardDepth + 2} ${-4 * standardDepth - 1} 0 ${-10 * standardDepth - 4} Z`}
            fill="url(#ga-flame)"
          >
            <animate attributeName="opacity" values="0.8;1;0.85;1" dur="1.3s" repeatCount="indefinite" />
          </path>
          <ellipse cx={standardX} cy={standardY + 2} rx={10 * standardDepth + 4} ry={2.5 * standardDepth + 1} fill="#000" opacity="0.4" />
        </g>
      )}

      {/* ── Colosses d'obsidienne, gardiens de l'arène ───────────────── */}
      <Colossus x={148} mirror={false} />
      <Colossus x={VB_W - 148} mirror />

      {/* ── Braseros du premier plan ─────────────────────────────────── */}
      {[352, VB_W - 352].map((bx, i) => (
        <g key={i}>
          <rect x={bx - 4} y={356} width={8} height={92} fill="#160b26" />
          <rect x={bx - 16} y={348} width={32} height={12} rx={4} fill="#221238" stroke="#000" strokeWidth="1" />
          <ellipse cx={bx} cy={346} rx={16} ry={20} fill="#ff7a2a" opacity="0.22" filter="url(#ga-glow-lg)" />
          <path d={`M ${bx} 322 C ${bx - 9} 334 ${bx - 7} 346 ${bx} 350 C ${bx + 7} 346 ${bx + 9} 334 ${bx} 322 Z`} fill="url(#ga-flame)" filter="url(#ga-glow)">
            <animate attributeName="opacity" values="0.85;1;0.9;1" dur="1.5s" begin={`-${i * 0.6}s`} repeatCount="indefinite" />
            <animateTransform attributeName="transform" type="scale" values="1 1;1.05 0.95;1 1" dur="1.5s" begin={`-${i * 0.6}s`} additive="sum" repeatCount="indefinite" />
          </path>
        </g>
      ))}

      {/* ── Braises montantes ────────────────────────────────────────── */}
      {EMBERS.map(([x, y0, r, dur, delay], i) => (
        <circle key={i} cx={x} cy={y0} r={r} fill={i % 3 === 0 ? GOLD : '#ff9a4a'} opacity="0">
          <animate attributeName="cy" values={`${y0};${y0 - 110}`} dur={`${dur}s`} begin={`-${delay}s`} repeatCount="indefinite" />
          <animate attributeName="cx" values={`${x};${x + (i % 2 === 0 ? 14 : -14)};${x}`} dur={`${dur}s`} begin={`-${delay}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;0.9;0" dur={`${dur}s`} begin={`-${delay}s`} repeatCount="indefinite" />
        </circle>
      ))}

      {/* Vignette */}
      <rect x="0" y="0" width={VB_W} height={VB_H} fill="url(#ga-void)" opacity="0" />
      <rect x="0" y="0" width={VB_W} height="26" fill="#000" opacity="0.25" />
    </svg>
  );
}

/** Colosse d'obsidienne : gardien monumental, épée plantée, yeux ardents. */
function Colossus({ x, mirror }: { x: number; mirror: boolean }) {
  const s = mirror ? -1 : 1;
  return (
    <g transform={`translate(${x},0) scale(${s},1)`}>
      {/* Épée plantée devant lui */}
      <line x1={64} y1={252} x2={64} y2={452} stroke="#39305a" strokeWidth="7" />
      <polygon points="64,238 72,258 64,270 56,258" fill="#4c4174" stroke="#1a1230" strokeWidth="1.5" />
      <rect x={44} y={266} width={40} height={7} rx={3} fill="#2c2448" />
      {/* Silhouette : jambes, torse, épaules, heaume */}
      <path
        d="M -8,452 L 2,336 L -6,300 L 10,236 L 2,196 L 22,168 L 46,166 L 58,192 L 52,238 L 66,300 L 56,340 L 68,452 Z"
        fill="#0d0a1e"
        stroke="#3d2f66"
        strokeWidth="2"
      />
      {/* Épaulière */}
      <path d="M 2,196 L -16,206 L -10,238 L 10,236 Z" fill="#131029" stroke="#3d2f66" strokeWidth="2" />
      {/* Heaume */}
      <path d="M 20,168 L 18,142 L 34,132 L 48,142 L 48,166 Z" fill="#131029" stroke="#3d2f66" strokeWidth="2" />
      {/* Cimier */}
      <path d="M 33,132 L 30,112 L 38,120 L 36,132 Z" fill="#251c42" />
      {/* Yeux ardents */}
      <circle cx={29} cy={152} r={2.6} fill="#c084fc" filter="url(#ga-glow)">
        <animate attributeName="opacity" values="0.5;1;0.5" dur="3.4s" repeatCount="indefinite" />
      </circle>
      <circle cx={41} cy={152} r={2.6} fill="#c084fc" filter="url(#ga-glow)">
        <animate attributeName="opacity" values="0.5;1;0.5" dur="3.4s" repeatCount="indefinite" />
      </circle>
      {/* Fissures runiques du torse */}
      <polyline points="26,210 32,226 26,240 34,258" fill="none" stroke="#c084fc" strokeWidth="1.4" opacity="0.5">
        <animate attributeName="opacity" values="0.25;0.6;0.25" dur="5s" repeatCount="indefinite" />
      </polyline>
      {/* Assise d'ombre */}
      <ellipse cx={30} cy={452} rx={64} ry={9} fill="#000" opacity="0.45" />
    </g>
  );
}

/* ───────────────────────────────────────────────────── résultat + replay ── */

function GauntletResult({ run, onReplay }: { run: GauntletRunResponse; onReplay: () => void }) {
  const gained = run.cleared_new > 0;
  return (
    <div className="panel anim-pop space-y-3 p-4">
      <span
        className={`flex items-center gap-1.5 font-display text-lg font-bold ${
          gained ? 'text-[var(--color-gold)]' : 'text-[var(--color-ember)]'
        }`}
      >
        <UiIcon name={gained ? 'victory' : 'defeat'} size={20} color="currentColor" />
        {gained
          ? `Nouveau record : vague ${run.best_wave} (+${run.cleared_new}) !`
          : `Arrêt à la vague ${run.reached_wave} — record inchangé (${run.best_wave})`}
      </span>

      <p className="text-xs text-[var(--color-muted)]">
        Rente actuelle : <strong className="text-[var(--color-gold)]">{run.per_day}</strong>{' '}
        {resourceMeta(ETERNITY_RESOURCE).label}/jour.
        {run.banked_eternity > 0 && (
          <>
            {' '}
            Encaissé au passage :{' '}
            <strong className="text-[var(--color-gold-soft)]">+{run.banked_eternity}</strong>.
          </>
        )}
      </p>

      {run.wave_results.length > 0 && (
        <button onClick={onReplay} className="btn btn-arcane w-full text-sm">
          ▶ Revoir la course ({run.wave_results.length} vague
          {run.wave_results.length > 1 ? 's' : ''})
        </button>
      )}
    </div>
  );
}

function GauntletReplay({
  waves,
  index,
  onIndex,
  onClose,
  auto,
  onToggleAuto,
}: {
  waves: GauntletWaveResult[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  auto: boolean;
  onToggleAuto: () => void;
}) {
  const wave = waves[index]!;
  const hasPrev = index > 0;
  const hasNext = index < waves.length - 1;
  const lost = wave.combat.result === 'loss';

  const [finished, setFinished] = useState(false);
  useEffect(() => {
    setFinished(false);
  }, [index]);
  useEffect(() => {
    if (!finished || !auto || !hasNext || lost) return;
    const t = setTimeout(() => onIndex(index + 1), AUTO_NEXT_MS);
    return () => clearTimeout(t);
  }, [finished, auto, hasNext, lost, index, onIndex]);

  return (
    <CombatReplay
      key={index}
      combat={toStored(wave.combat)}
      enemyKind={wave.isBoss ? 'boss' : 'normal'}
      onClose={onClose}
      onDone={() => setFinished(true)}
      title={`Vague ${wave.wave}${wave.isBoss ? ' — Boss' : ''}`}
      headerExtra={
        <button
          onClick={onToggleAuto}
          title="Enchaîner automatiquement les vagues (l'escouade récupère tous ses PV entre chaque)"
          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
            auto
              ? 'border-[var(--color-arcane)] bg-[var(--color-arcane)]/20 text-[var(--color-ink)]'
              : 'border-[var(--color-edge)] text-[var(--color-muted)] hover:text-[var(--color-ink)]'
          }`}
        >
          {auto ? '⏩ Auto ON' : '⏩ Auto'}
        </button>
      }
      footer={
        <div className="mt-3 flex flex-col items-center gap-2">
          {finished && auto && hasNext && !lost && (
            <span className="text-[11px] text-[var(--color-arcane)]">
              Vague suivante dans un instant… (Auto)
            </span>
          )}
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => hasPrev && onIndex(index - 1)}
              disabled={!hasPrev}
              className="btn btn-ghost text-xs disabled:opacity-40"
            >
              ◀ Vague précédente
            </button>
            {hasNext && !lost ? (
              <button onClick={() => onIndex(index + 1)} className="btn btn-primary text-xs">
                Vague suivante ▶
              </button>
            ) : (
              <button onClick={onClose} className="btn btn-primary text-xs">
                Voir le bilan
              </button>
            )}
          </div>
        </div>
      }
    />
  );
}
