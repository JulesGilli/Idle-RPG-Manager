import { Link } from 'react-router-dom';
import { SyntyGlyph } from '@/components/synty/SyntyIcon';
import { UiIcon } from '@/components/synty/GameIcons';
import { syntyUrl } from '@/lib/synty';
import { useUnlocks } from '@/hooks/useUnlocks';
import { useActionAlerts } from '@/hooks/useActionAlerts';
import { useDeployments, useMaps } from '@/features/maps/useMaps';
import { useActiveExpeditions } from '@/features/expedition/useExpedition';
import { NotifDot } from '@/components/NotifDot';
import { ACTIVITY_UNLOCKS, type ActivityKey } from '@shared/progression/account.ts';

type Activity = {
  to: string;
  iconSrc: string;
  title: string;
  desc: string;
  accent: string;
  /** Palier de déblocage ; absent = toujours disponible (la Carte). */
  activity?: ActivityKey;
};

// Toutes les façons de partir au combat, regroupées en un seul endroit.
const ACTIVITIES: Activity[] = [
  {
    to: '/map',
    iconSrc: syntyUrl.map('Flag01'),
    title: 'Carte du monde',
    desc: 'Déploie tes escouades zone par zone : le cœur du farm, en continu.',
    accent: '#5fd39b',
  },
  {
    to: '/tower',
    iconSrc: syntyUrl.map('Target01'),
    title: 'La Tour',
    desc: 'Un héros grimpe étage par étage, la difficulté monte sans cesse.',
    accent: '#56b6f4',
    activity: 'tower',
  },
  {
    to: '/dungeon',
    iconSrc: syntyUrl.map('Skull01'),
    title: 'Donjons',
    desc: 'Une chaîne de combats sans repos : duel d’endurance jusqu’au boss.',
    accent: '#c084fc',
    activity: 'dungeon',
  },
  {
    to: '/expeditions',
    iconSrc: syntyUrl.map('Horse01'),
    title: 'Expéditions',
    desc: 'Envoie une équipe en mission longue et récolte à son retour.',
    accent: '#e0793c',
    activity: 'expedition',
  },
  {
    to: '/arena',
    iconSrc: syntyUrl.inv('Swords01'),
    title: 'Arène',
    desc: 'Affronte les escouades des autres joueurs et grimpe au classement.',
    accent: '#f5b544',
    activity: 'arena',
  },
  {
    to: '/arc-boss',
    iconSrc: syntyUrl.map('Dragon01'),
    title: "Boss d'arc",
    desc: 'Les grands boss de la campagne : le défi de fin d’arc.',
    accent: '#ef5d7a',
    activity: 'arc_boss',
  },
];

/** Quelle carte doit porter une gommette « action dispo ». */
function alertFor(to: string, alerts: ReturnType<typeof useActionAlerts>): boolean {
  if (to === '/dungeon') return alerts.dungeon;
  if (to === '/expeditions') return alerts.expedition;
  return false;
}

/**
 * Où l'escouade est-elle ENGAGÉE en ce moment ? Seules la Carte (déploiements) et
 * les Expéditions immobilisent réellement des héros dans la durée — la tour, les
 * donjons et l'arène se jouent activement, sans occupation persistante.
 */
function useSquadStatuses(): Record<string, string | undefined> {
  const deps = useDeployments().data ?? [];
  const maps = useMaps().data ?? [];
  const exps = useActiveExpeditions().data ?? [];

  const byPath: Record<string, string | undefined> = {};

  if (deps.length > 0) {
    const heroes = new Set(deps.flatMap((d) => d.hero_ids)).size;
    const loop = deps.find((d) => d.mode === 'loop');
    const rep = loop ?? deps[0]!;
    const zone = maps.find((m) => m.levels.some((l) => l.id === rep.level_id))?.name;
    const verb = loop ? 'farme' : 'en campagne';
    byPath['/map'] = zone
      ? `${heroes} héros · ${verb} ${zone}`
      : `${heroes} héros déployés`;
  }

  if (exps.length > 0) {
    const heroes = exps.reduce((n, r) => n + r.hero_ids.length, 0);
    byPath['/expeditions'] = `${heroes} héros en expédition`;
  }

  return byPath;
}

export function ActivitiesScreen() {
  const alerts = useActionAlerts();
  const statuses = useSquadStatuses();
  return (
    <section className="anim-fade space-y-6">
      {/* Bandeau : le panneau de quêtes au bord de la route, d'où l'on part à l'aventure */}
      <div className="panel relative overflow-hidden">
        <div className="relative h-48 w-full sm:h-52">
          <div className="absolute inset-0">
            <QuestBoardScene />
          </div>
          {/* Scrim pour la lisibilité du titre */}
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-panel)] via-[var(--color-panel)]/30 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-6">
            <h2 className="heading flex items-center gap-2.5 text-2xl">
              <SyntyGlyph src={syntyUrl.inv('Swords01')} size={26} color="var(--color-gold-soft)" />
              Activités
            </h2>
            <p className="mt-1 max-w-xl text-sm text-[var(--color-muted)]">
              Décroche un contrat au panneau de quêtes et pars à l’aventure : la carte pour farmer,
              la tour et les donjons pour les défis, les expéditions, l’arène et les boss d’arc.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ACTIVITIES.map((a) => (
          <ActivityCard
            key={a.to}
            activity={a}
            alert={alertFor(a.to, alerts)}
            status={statuses[a.to]}
          />
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------- panneau de quêtes (SVG) -- */

/** Un parchemin épinglé au panneau, avec des lignes d'écriture et une punaise. */
function Note({
  x,
  y,
  w,
  h,
  rot,
  pin,
  seal = false,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  pin: string;
  seal?: boolean;
}) {
  const lines = Math.max(2, Math.round((h - 14) / 9));
  return (
    <g transform={`translate(${x},${y}) rotate(${rot})`}>
      <rect x={0} y={0} width={w} height={h} rx="1.5" fill="#efe2bd" stroke="#c9b487" strokeWidth="0.6" />
      {Array.from({ length: lines }).map((_, i) => (
        <rect
          key={i}
          x={5}
          y={9 + i * 8}
          width={w - 10 - (i === lines - 1 ? 8 : 0)}
          height={1.4}
          rx="0.7"
          fill="#b7a074"
          opacity="0.7"
        />
      ))}
      {seal && <circle cx={w - 8} cy={h - 8} r={4} fill="#b53a3a" opacity="0.85" />}
      {/* Punaise */}
      <circle cx={w / 2} cy={3.5} r={2.4} fill={pin} />
      <circle cx={w / 2 - 0.7} cy={2.8} r={0.8} fill="#fff" opacity="0.7" />
    </g>
  );
}

function QuestBoardScene() {
  const GY = 158;
  return (
    <svg
      viewBox="0 0 1360 190"
      className="h-full w-full"
      preserveAspectRatio="xMidYMax slice"
      role="img"
      aria-label="Panneau de quêtes au bord de la route, au petit matin"
    >
      <defs>
        <linearGradient id="qb-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1b2a4a" />
          <stop offset="55%" stopColor="#4a5a7a" />
          <stop offset="100%" stopColor="#d79a6a" />
        </linearGradient>
        <radialGradient id="qb-sun" cx="0.5" cy="1" r="0.9">
          <stop offset="0%" stopColor="#ffd9a0" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffd9a0" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="qb-road" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8a7a5a" />
          <stop offset="100%" stopColor="#5a4c38" />
        </linearGradient>
        <filter id="qb-glow" x="-70%" y="-70%" width="240%" height="240%">
          <feGaussianBlur stdDeviation="1.8" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Ciel + soleil levant + collines */}
      <rect x="0" y="0" width="1360" height="190" fill="url(#qb-sky)" />
      <ellipse cx="680" cy="168" rx="760" ry="130" fill="url(#qb-sun)" />
      <circle cx="680" cy="150" r="30" fill="#ffe6b8" opacity="0.5" filter="url(#qb-glow)" />
      {[70, 210, 300, 430, 520, 640, 760, 900, 1020, 1160, 1280].map((x, i) => (
        <circle key={i} cx={x} cy={14 + (i % 3) * 7} r={i % 2 ? 1 : 0.7} fill="#fff" opacity="0.35" />
      ))}

      {/* Montagnes lointaines */}
      <path
        d="M0,132 L150,96 L300,128 L470,88 L620,126 L780,92 L940,128 L1120,94 L1280,126 L1360,108 L1360,190 L0,190 Z"
        fill="#2c3552"
        opacity="0.85"
      />
      <path
        d="M0,140 Q200,120 420,138 Q660,156 900,136 Q1150,120 1360,140 L1360,190 L0,190 Z"
        fill="#243049"
      />

      {/* Sol */}
      <rect x="0" y={GY} width="1360" height={190 - GY} fill="#3a3121" />
      <rect x="0" y={GY} width="1360" height="3" fill="#4a3f28" />

      {/* Route qui file vers l'horizon (part du panneau vers le soleil) */}
      <polygon points={`612,190 748,190 704,150 656,150`} fill="url(#qb-road)" />
      <polygon points={`656,150 704,150 700,140 660,140`} fill="#6a5c44" opacity="0.7" />
      {/* Pointillés centraux de la route */}
      {([
        [680, 184, 10, 4],
        [680, 174, 8, 3.2],
        [680, 166, 6, 2.6],
        [680, 159, 4.5, 2],
      ] as [number, number, number, number][]).map(([cx, cy, w, h], i) => (
        <rect key={i} x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx="1" fill="#cdbb90" opacity="0.5" />
      ))}

      {/* Buissons de bord de route */}
      {[120, 250, 1080, 1240].map((x, i) => (
        <g key={i}>
          <circle cx={x} cy={GY - 8} r={11} fill="#25361f" />
          <circle cx={x - 9} cy={GY - 3} r={8} fill="#1f2e1b" />
          <circle cx={x + 9} cy={GY - 3} r={8} fill="#2b3d22" />
        </g>
      ))}

      {/* ---------------- Panneau de quêtes (gauche) ---------------- */}
      <g>
        {/* Poteaux */}
        <rect x={392} y={70} width={10} height={GY - 70} fill="#3c2c1c" />
        <rect x={520} y={70} width={10} height={GY - 70} fill="#3c2c1c" />
        {/* Cadre + planches du panneau */}
        <rect x={378} y={58} width={166} height={70} rx="4" fill="#2f2114" />
        <rect x={384} y={64} width={154} height={58} rx="2" fill="#5a4126" />
        {[64, 76, 88, 100, 112].map((py) => (
          <rect key={py} x={384} y={py} width={154} height={1} fill="#3c2c1a" opacity="0.6" />
        ))}
        {/* Fronton "AVENTURES" */}
        <polygon points="378,58 544,58 536,48 386,48" fill="#3c2c1a" />
        <rect x={410} y={50} width={102} height={5} rx="2.5" fill="#8a6a3e" opacity="0.8" />

        {/* Parchemins épinglés */}
        <Note x={392} y={68} w={40} h={48} rot={-3} pin="#d14b4b" seal />
        <Note x={440} y={70} w={38} h={44} rot={2} pin="#4b8fd1" />
        <Note x={486} y={66} w={42} h={40} rot={-1} pin="#4bbf7a" />
        <Note x={452} y={94} w={34} h={26} rot={5} pin="#e0b03c" />
      </g>

      {/* ---------------- Torche à droite du panneau ---------------- */}
      <g>
        <rect x={556} y={104} width={5} height={GY - 104} fill="#2e2114" />
        <ellipse cx={558} cy={100} rx={9} ry={12} fill="#ff7a2a" opacity="0.28" filter="url(#qb-glow)" />
        <path d="M558,92 C553,98 554,106 558,108 C562,106 563,98 558,92 Z" fill="#ffb03a" filter="url(#qb-glow)">
          <animate attributeName="opacity" values="0.85;1;0.9;1" dur="1.4s" repeatCount="indefinite" />
          <animateTransform
            attributeName="transform"
            type="scale"
            values="1 1;1.06 0.96;1 1"
            dur="1.4s"
            additive="sum"
            repeatCount="indefinite"
          />
        </path>
        <path d="M558,95 C555,99 556,104 558,106 C560,104 561,99 558,95 Z" fill="#ffe58a" />
      </g>

      {/* ---------------- Poteau indicateur (droite) ---------------- */}
      <g>
        <rect x={922} y={104} width={7} height={GY - 104} fill="#3c2c1c" />
        {/* Flèches de direction */}
        <g>
          <polygon points="884,110 936,110 946,116 936,122 884,122" fill="#6a4e2c" />
          <rect x={890} y={114} width={40} height={2} rx="1" fill="#c9b487" opacity="0.7" />
        </g>
        <g>
          <polygon points="926,126 978,126 968,120 918,120 918,132 968,132" fill="#5a4126" />
          <rect x={926} y={129} width={40} height={2} rx="1" fill="#c9b487" opacity="0.6" />
        </g>
      </g>

      {/* ---------------- Aventurier qui part sur la route ---------------- */}
      <g transform="translate(690,150)">
        <animateTransform
          attributeName="transform"
          type="translate"
          values="690,150; 686,148; 690,150"
          dur="2.4s"
          repeatCount="indefinite"
        />
        {/* ombre */}
        <ellipse cx={0} cy={7} rx={7} ry={2} fill="#000" opacity="0.25" />
        {/* cape / corps */}
        <path d="M-4,-14 L4,-14 L6,6 L-6,6 Z" fill="#3a4d7a" />
        <circle cx={0} cy={-17} r={3.2} fill="#caa070" />
        {/* bâton d'aventurier */}
        <line x1={6} y1={-18} x2={9} y2={7} stroke="#4a3720" strokeWidth="1.4" />
        <circle cx={9} cy={-18} r={1.6} fill="#e0b03c" />
      </g>
    </svg>
  );
}

function ActivityCard({
  activity: a,
  alert = false,
  status,
}: {
  activity: Activity;
  alert?: boolean;
  status?: string | undefined;
}) {
  const unlocks = useUnlocks();
  const locked = a.activity ? !unlocks.unlocked(a.activity) : false;
  const reqLabel = a.activity ? `Niveau de compte ${ACTIVITY_UNLOCKS[a.activity]}` : '';

  const inner = (
    <>
      <span
        className="absolute inset-y-0 left-0 w-1.5"
        style={{ background: locked ? 'var(--color-edge-strong)' : a.accent }}
      />
      <NotifDot show={alert} className="right-3 top-3" title="À réclamer / prêt" />

      <div className="flex items-start gap-4 p-5 pl-6">
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: locked ? 'rgba(255,255,255,0.04)' : `${a.accent}1f` }}
        >
          <SyntyGlyph src={a.iconSrc} size={38} color={locked ? 'var(--color-muted)' : a.accent} />
        </div>
        <div className="min-w-0">
          <h4 className="font-display text-base font-bold text-[var(--color-ink)]">{a.title}</h4>
          <p className="mt-1.5 text-sm text-[var(--color-muted)]">{a.desc}</p>
          {status && !locked && (
            <span
              className="mt-2 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ background: `${a.accent}22`, color: a.accent }}
              title="Ton escouade est active ici"
            >
              <span
                className="h-1.5 w-1.5 animate-pulse rounded-full"
                style={{ background: a.accent }}
              />
              {status}
            </span>
          )}
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-[var(--color-edge)] px-6 py-3 text-sm font-semibold text-[var(--color-muted)]">
        {locked ? (
          <span className="inline-flex items-center gap-1.5">
            <UiIcon name="lock" size={14} color="currentColor" /> {reqLabel}
          </span>
        ) : (
          <>
            <span className="transition group-hover:text-[var(--color-ink)]">Y aller</span>
            <span className="transition group-hover:translate-x-0.5">→</span>
          </>
        )}
      </div>
    </>
  );

  const tourKey = a.to === '/map' ? 'activity-map' : undefined;

  if (locked) {
    return (
      <div
        data-tour={tourKey}
        className="panel relative flex cursor-not-allowed flex-col overflow-hidden opacity-70"
        title={`Débloqué : ${reqLabel}`}
      >
        {inner}
      </div>
    );
  }

  return (
    <Link data-tour={tourKey} to={a.to} className="panel panel-hover group relative flex flex-col overflow-hidden">
      {inner}
    </Link>
  );
}
