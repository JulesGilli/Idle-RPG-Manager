import { useState } from 'react';
import { BackToVillage } from '@/components/BackToVillage';
import { UiIcon } from '@/components/synty/GameIcons';
import { compactNumber, fullNumber } from '@/lib/gameUi';
import { REFINERY_MIN_ARC } from '@shared/progression/refinery';
import { useRefinery, type RefineryState } from './useRefinery';

const ACCENT = '#f5b544';

export function RefineryScreen() {
  const { query, upgrade } = useRefinery();
  const [error, setError] = useState<string | null>(null);
  const data = query.data;

  function onUpgrade() {
    setError(null);
    upgrade.mutate(undefined, { onError: (e) => setError(e instanceof Error ? e.message : 'Erreur') });
  }

  return (
    <section className="anim-fade space-y-6">
      <BackToVillage />

      {/* Bandeau : la fonderie, creuset d'or en fusion */}
      <div className="panel relative overflow-hidden">
        <div className="relative h-48 w-full sm:h-56">
          <div className="absolute inset-0">
            <FoundryScene />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-panel)] via-[var(--color-panel)]/25 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-6">
            <h2 className="heading flex items-center gap-2.5 text-2xl">
              <span aria-hidden style={{ color: ACCENT }}>⚙</span>
              La Raffinerie
            </h2>
            <p className="mt-1 max-w-xl text-sm text-[var(--color-muted)]">
              Déverse ton or dans le grand creuset : chaque palier augmente le rendement de{' '}
              <strong>toutes les ressources</strong> récoltées sur la carte du monde. Le puits d'or du
              fin de partie.
            </p>
          </div>
        </div>
      </div>

      {query.isLoading && <p className="text-[var(--color-muted)]">Chargement de la Raffinerie…</p>}

      {data && !data.unlocked && (
        <div className="panel p-6 text-center">
          <h3 className="heading text-xl">Bâtiment scellé</h3>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            La Raffinerie s'éveille en <strong>Arc {REFINERY_MIN_ARC}</strong>. Termine l'arc en cours
            pour en ouvrir les portes.
          </p>
        </div>
      )}

      {data && data.unlocked && (
        <RefineryPanel
          data={data}
          busy={upgrade.isPending}
          error={error}
          onUpgrade={onUpgrade}
        />
      )}
    </section>
  );
}

function RefineryPanel({
  data,
  busy,
  error,
  onUpgrade,
}: {
  data: RefineryState;
  busy: boolean;
  error: string | null;
  onUpgrade: () => void;
}) {
  const pctToMax = Math.round((data.level / data.max_level) * 100);
  const canAfford = data.next_cost != null && data.gold >= data.next_cost;

  return (
    <div className="space-y-4">
      {/* Chiffres clés */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Niveau" value={`${data.level} / ${data.max_level}`} />
        <StatTile label="Bonus de récolte" value={`+${data.bonus_pct}%`} accent />
        <StatTile
          label="Rendement"
          value={`×${data.drop_mult.toFixed(2).replace(/\.00$/, '').replace('.', ',')}`}
        />
      </div>

      {/* Barre de progression vers le niveau max */}
      <div className="panel p-4">
        <div className="mb-1.5 flex items-center justify-between text-[11px] text-[var(--color-muted)]">
          <span>Progression du bâtiment</span>
          <span className="tabular-nums">{pctToMax}%</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/30">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{
              width: `${pctToMax}%`,
              background: `linear-gradient(90deg, ${ACCENT}, #ffd27a)`,
              boxShadow: `0 0 12px -2px ${ACCENT}`,
            }}
          />
        </div>
      </div>

      {/* Carte d'upgrade */}
      <div className="panel space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="font-display text-sm font-semibold text-[var(--color-ink)]">
            {data.maxed ? 'Rendement maximal atteint' : `Passer au niveau ${data.level + 1}`}
          </span>
          <span className="flex items-center gap-1 text-xs text-[var(--color-gold-soft)]" title={`${fullNumber(data.gold)} or`}>
            <UiIcon name="gold" size={13} /> {compactNumber(data.gold)}
          </span>
        </div>

        {data.maxed ? (
          <p className="text-sm text-[var(--color-muted)]">
            La Raffinerie tourne à plein régime : +{data.bonus_pct}% de récolte, il n'y a plus rien à
            financer.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="flex items-center gap-1.5 text-[var(--color-muted)]">
                Coût
                <strong
                  className="flex items-center gap-1"
                  style={{ color: canAfford ? 'var(--color-gold-soft)' : 'var(--color-ember)' }}
                  title={`${fullNumber(data.next_cost ?? 0)} or`}
                >
                  <UiIcon name="gold" size={13} /> {compactNumber(data.next_cost ?? 0)}
                </strong>
              </span>
              <span className="text-[var(--color-muted)]">
                Récolte{' '}
                <strong className="text-[var(--color-ink)]">+{data.bonus_pct}%</strong>
                <span className="mx-1 text-[var(--color-muted)]/60">→</span>
                <strong style={{ color: ACCENT }}>+{data.next_bonus_pct}%</strong>
              </span>
            </div>

            <button
              onClick={onUpgrade}
              disabled={busy || !canAfford}
              className="btn btn-primary w-full text-sm disabled:opacity-40"
            >
              {busy ? 'Fonte en cours…' : canAfford ? 'Alimenter le creuset' : "Or insuffisant"}
            </button>
          </>
        )}

        {error && <p className="text-sm text-[var(--color-ember)]">{error}</p>}

        <p className="border-t border-[var(--color-edge)] pt-2 text-[11px] leading-snug text-[var(--color-muted)]">
          Le bonus s'applique en continu à ton farm de carte — matériaux de zone, composants de boss et
          gemmes compris. Il se cumule avec le bonus d'événement du week-end.
        </p>
      </div>
    </div>
  );
}

function StatTile({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="panel flex flex-col items-center justify-center gap-0.5 p-3 text-center">
      <span className="text-[10px] uppercase tracking-widest text-[var(--color-muted)]">{label}</span>
      <span
        className="font-display text-lg font-bold tabular-nums"
        style={{ color: accent ? ACCENT : 'var(--color-ink)' }}
      >
        {value}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------- décor (SVG) -- */

/** Fonderie : four à creuset d'or en fusion, engrenages, coulée et braises. */
function FoundryScene() {
  return (
    <svg
      viewBox="0 0 1360 200"
      className="h-full w-full"
      preserveAspectRatio="xMidYMax slice"
      role="img"
      aria-label="La grande fonderie : un creuset d'or en fusion sous les engrenages"
    >
      <defs>
        <linearGradient id="rf-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a1206" />
          <stop offset="55%" stopColor="#2a1c0b" />
          <stop offset="100%" stopColor="#3a2810" />
        </linearGradient>
        <radialGradient id="rf-heat" cx="0.5" cy="1" r="0.8">
          <stop offset="0%" stopColor="#ff9a3a" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ff9a3a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="rf-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe6a0" />
          <stop offset="100%" stopColor="#e0902a" />
        </linearGradient>
        <filter id="rf-glow" x="-70%" y="-70%" width="240%" height="240%">
          <feGaussianBlur stdDeviation="2.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect x="0" y="0" width="1360" height="200" fill="url(#rf-bg)" />
      {/* Halo de chaleur montant du creuset */}
      <ellipse cx="680" cy="205" rx="520" ry="150" fill="url(#rf-heat)" />

      {/* Tuyauterie de fond */}
      <g stroke="#5a4226" strokeWidth="7" opacity="0.6" fill="none">
        <path d="M120,40 H540 V80" />
        <path d="M1240,40 H820 V80" />
      </g>
      <g fill="#6a4e2c" opacity="0.5">
        {[180, 300, 1060, 1180].map((x, i) => (
          <circle key={i} cx={x} cy={40} r={5} />
        ))}
      </g>

      {/* Engrenages qui tournent, de part et d'autre */}
      <Gear cx={210} cy={92} r={46} teeth={12} color="#7a5a2e" dur={14} />
      <Gear cx={272} cy={132} r={30} teeth={10} color="#6a4e2c" dur={9} reverse />
      <Gear cx={1150} cy={92} r={46} teeth={12} color="#7a5a2e" dur={14} reverse />
      <Gear cx={1088} cy={132} r={30} teeth={10} color="#6a4e2c" dur={9} />

      {/* Le grand four à creuset (centre) */}
      <g>
        {/* corps du four */}
        <path d="M560,150 L560,86 Q560,66 600,66 L760,66 Q800,66 800,86 L800,150 Z" fill="#33240f" stroke="#5a4226" strokeWidth="3" />
        {/* bouche incandescente */}
        <path d="M596,150 L596,100 Q596,88 620,88 L740,88 Q764,88 764,100 L764,150 Z" fill="#8a3a10" />
        <path d="M612,150 L612,108 L748,108 L748,150 Z" fill="#d1571a">
          <animate attributeName="opacity" values="0.85;1;0.9;1" dur="1.6s" repeatCount="indefinite" />
        </path>
        {/* or en fusion qui bouillonne */}
        <rect x="628" y="126" width="104" height="24" fill="url(#rf-gold)" filter="url(#rf-glow)">
          <animate attributeName="y" values="126;122;126" dur="2.2s" repeatCount="indefinite" />
        </rect>
        {[648, 680, 712].map((x, i) => (
          <circle key={i} cx={x} cy={132} r={3.2} fill="#fff3c8" opacity="0.9">
            <animate attributeName="cy" values="140;120;140" dur={`${2 + i * 0.4}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;1;0" dur={`${2 + i * 0.4}s`} repeatCount="indefinite" />
          </circle>
        ))}
        {/* cheminée + fumée */}
        <rect x="666" y="40" width="28" height="30" fill="#3c2c1a" />
        {[0, 1, 2].map((i) => (
          <circle key={i} cx={680} cy={36 - i * 8} r={6 + i * 2} fill="#7a6a58" opacity={0.18 - i * 0.05}>
            <animate attributeName="cy" values={`${36 - i * 8};${10 - i * 8};${36 - i * 8}`} dur={`${3 + i}s`} repeatCount="indefinite" />
          </circle>
        ))}
      </g>

      {/* Coulée d'or vers un lingotier */}
      <g>
        <rect x="806" y="120" width="60" height="10" rx="3" fill="#4a3720" transform="rotate(12 806 120)" />
        <path d="M846,132 q6,20 2,40" stroke="url(#rf-gold)" strokeWidth="5" fill="none" filter="url(#rf-glow)">
          <animate attributeName="opacity" values="0.7;1;0.7" dur="1.3s" repeatCount="indefinite" />
        </path>
        {/* lingots empilés */}
        <g fill="url(#rf-gold)" stroke="#b5791f" strokeWidth="1">
          <polygon points="820,182 872,182 866,172 826,172" />
          <polygon points="828,170 864,170 858,161 834,161" />
          <polygon points="836,159 856,159 851,151 841,151" />
        </g>
      </g>

      {/* Braises qui montent */}
      {([
        [500, 150], [560, 160], [820, 150], [900, 158], [640, 165], [740, 162], [420, 150], [1000, 150],
      ] as [number, number][]).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 2 ? 1.6 : 1.1} fill="#ffb85a">
          <animate attributeName="cy" values={`${y};${y - 60};${y - 110}`} dur={`${3 + (i % 4)}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;0.9;0" dur={`${3 + (i % 4)}s`} repeatCount="indefinite" />
        </circle>
      ))}

      {/* Sol de la fonderie */}
      <rect x="0" y="176" width="1360" height="24" fill="#241708" />
      <rect x="0" y="176" width="1360" height="3" fill="#3a2810" />
    </svg>
  );
}

function Gear({
  cx,
  cy,
  r,
  teeth,
  color,
  dur,
  reverse = false,
}: {
  cx: number;
  cy: number;
  r: number;
  teeth: number;
  color: string;
  dur: number;
  reverse?: boolean;
}) {
  const tooth = r * 0.28;
  const teethEls = Array.from({ length: teeth }).map((_, i) => {
    const a = (i / teeth) * Math.PI * 2;
    return (
      <rect
        key={i}
        x={-tooth * 0.55}
        y={-r - tooth * 0.6}
        width={tooth * 1.1}
        height={tooth}
        rx="1"
        fill={color}
        transform={`rotate(${(a * 180) / Math.PI})`}
      />
    );
  });
  return (
    <g transform={`translate(${cx},${cy})`} opacity="0.75">
      <g>
        <animateTransform
          attributeName="transform"
          type="rotate"
          from={reverse ? '360' : '0'}
          to={reverse ? '0' : '360'}
          dur={`${dur}s`}
          repeatCount="indefinite"
        />
        {teethEls}
        <circle r={r} fill={color} />
        <circle r={r * 0.62} fill="#241708" opacity="0.55" />
        <circle r={r * 0.16} fill={color} />
      </g>
    </g>
  );
}
