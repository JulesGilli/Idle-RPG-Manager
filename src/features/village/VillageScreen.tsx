import { Link } from 'react-router-dom';
import { SyntyGlyph, SyntyImg } from '@/components/synty/SyntyIcon';
import { UiIcon } from '@/components/synty/GameIcons';
import { syntyUrl } from '@/lib/synty';
import { useUnlocks } from '@/hooks/useUnlocks';
import { useActionAlerts } from '@/hooks/useActionAlerts';
import { NotifDot } from '@/components/NotifDot';
import { ACTIVITY_UNLOCKS, type ActivityKey } from '@shared/progression/account.ts';

type Building = {
  to: string;
  /** 'glyph' = silhouette teintée (icônes Map) ; 'img' = pleine couleur (icônes objet). */
  iconKind: 'glyph' | 'img';
  iconSrc: string;
  title: string;
  /** Le tenancier — donne vie à la boutique. */
  keeper: string;
  desc: string;
  accent: string;
  activity: ActivityKey;
};

// Le village est un lieu : on flâne sur la place et on entre dans les échoppes.
// Deux quartiers : les artisans (craft) et la place (vie sociale).
const ARTISANS: Building[] = [
  {
    to: '/forge',
    iconKind: 'glyph',
    iconSrc: syntyUrl.inv('Crafting01'),
    title: 'Forge',
    keeper: 'Borin, le forgeron',
    desc: 'Fabrique armes et armures, puis renforce-les.',
    accent: '#f0934a',
    activity: 'forge',
  },
  {
    to: '/relics',
    iconKind: 'glyph',
    iconSrc: syntyUrl.map('Magic01'),
    title: 'Autel des Reliques',
    keeper: 'Le gardien voilé',
    desc: 'Façonne des reliques à partir du butin des donjons.',
    accent: '#c084fc',
    activity: 'relic',
  },
  {
    to: '/jewelry',
    iconKind: 'glyph',
    iconSrc: syntyUrl.inv('Necklaces01'),
    title: 'Joaillerie',
    keeper: 'Lys, la joaillière',
    desc: 'Sertit des bijoux à passifs, puis les raffine.',
    accent: '#60a5fa',
    activity: 'jewelry',
  },
  {
    to: '/library',
    iconKind: 'glyph',
    iconSrc: syntyUrl.inv('Notes02'),
    title: 'Bibliothèque du Savoir',
    keeper: 'Maître Aldric',
    desc: 'Forme tes héros dans leurs arbres de compétence.',
    accent: '#8b7cf6',
    activity: 'library',
  },
  {
    to: '/encyclopedia',
    iconKind: 'glyph',
    iconSrc: syntyUrl.map('Unknown01'),
    title: 'Encyclopédie du Royaume',
    keeper: 'Séraphine, l’archiviste',
    desc: 'Le grand grimoire : classes, combat, sets, passifs et matériaux.',
    accent: '#34d399',
    activity: 'encyclopedia',
  },
];

const PLACE: Building[] = [
  {
    to: '/tavern',
    iconKind: 'glyph',
    iconSrc: syntyUrl.map('Tavern01'),
    title: 'Taverne',
    keeper: 'Marta, la tavernière',
    desc: 'Recrute les aventuriers du jour (renouvelés à minuit).',
    accent: '#e8b64a',
    activity: 'tavern',
  },
  {
    to: '/guild',
    iconKind: 'glyph',
    iconSrc: syntyUrl.hud('Symbol_LionHead01'),
    title: 'Hôtel de Guilde',
    keeper: 'Le maître de guilde',
    desc: 'Fonde ou rejoins une guilde, monte-la en niveau et lance des raids.',
    accent: '#f5b544',
    activity: 'guild',
  },
];

export function VillageScreen() {
  return (
    <section className="anim-fade space-y-6">
      {/* Bandeau : panorama du village au crépuscule */}
      <div className="panel relative overflow-hidden">
        <div className="relative h-48 w-full sm:h-52">
          <div className="absolute inset-0">
            <VillageSkyline />
          </div>
          {/* Scrim pour la lisibilité du titre */}
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-panel)] via-[var(--color-panel)]/30 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-6">
            <h2 className="heading flex items-center gap-2.5 text-2xl">
              <SyntyGlyph src={syntyUrl.map('Home01')} size={26} color="var(--color-gold-soft)" />
              Village
            </h2>
            <p className="mt-1 max-w-xl text-sm text-[var(--color-muted)]">
              Flâne sur la place et pousse la porte des échoppes : les artisans équipent et forment
              tes héros, la taverne et l'hôtel de guilde animent la vie du royaume.
            </p>
          </div>
        </div>
      </div>

      <Quarter title="Le quartier des artisans" buildings={ARTISANS} />
      <Quarter title="La place du village" buildings={PLACE} />
    </section>
  );
}

/* ------------------------------------------------------ panorama du village -- */

/** Fenêtre chaude et lumineuse (option scintillement). */
function Win({ x, y, w = 6, h = 8, flicker = false }: { x: number; y: number; w?: number; h?: number; flicker?: boolean }) {
  return (
    <rect x={x} y={y} width={w} height={h} rx="1" fill="#ffd27a" filter="url(#vil-glow)">
      {flicker && (
        <animate attributeName="opacity" values="0.85;1;0.88;1" dur="3.6s" repeatCount="indefinite" />
      )}
    </rect>
  );
}

/** Fumée qui monte d'une cheminée. */
function Smoke({ x, y, begin }: { x: number; y: number; begin: string }) {
  return (
    <circle cx={x} cy={y} r="4" fill="#c9c2d4" opacity="0">
      <animate attributeName="cy" values={`${y};${y - 42}`} dur="4s" begin={begin} repeatCount="indefinite" />
      <animate attributeName="cx" values={`${x};${x + 8}`} dur="4s" begin={begin} repeatCount="indefinite" />
      <animate attributeName="r" values="2;7" dur="4s" begin={begin} repeatCount="indefinite" />
      <animate attributeName="opacity" values="0;0.4;0" dur="4s" begin={begin} repeatCount="indefinite" />
    </circle>
  );
}

/** Lampadaire avec halo qui palpite. */
function Lantern({ x, gy }: { x: number; gy: number }) {
  return (
    <g>
      <rect x={x - 1} y={gy - 26} width="2" height="26" fill="#1c1626" />
      <circle cx={x} cy={gy - 28} r="10" fill="#ffcf6a" opacity="0.16" filter="url(#vil-glow)" />
      <circle cx={x} cy={gy - 28} r="3" fill="#ffdf8f" filter="url(#vil-glow)">
        <animate attributeName="opacity" values="0.8;1;0.85;1" dur="2.8s" repeatCount="indefinite" />
      </circle>
    </g>
  );
}

const WALL = '#241b2b';
const ROOF = '#3a2418';
const GY = 152;

function VillageSkyline() {
  return (
    <svg
      viewBox="0 0 1360 190"
      className="h-full w-full"
      preserveAspectRatio="xMidYMax slice"
      role="img"
      aria-label="Panorama du village au crépuscule"
    >
      <defs>
        <linearGradient id="vil-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#171335" />
          <stop offset="55%" stopColor="#3f2b45" />
          <stop offset="100%" stopColor="#7a4632" />
        </linearGradient>
        <radialGradient id="vil-horizon" cx="0.5" cy="1" r="0.8">
          <stop offset="0%" stopColor="#ff9a4a" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#ff9a4a" stopOpacity="0" />
        </radialGradient>
        <filter id="vil-glow" x="-70%" y="-70%" width="240%" height="240%">
          <feGaussianBlur stdDeviation="1.8" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect x="0" y="0" width="1360" height="190" fill="url(#vil-sky)" />
      <ellipse cx="680" cy="152" rx="720" ry="120" fill="url(#vil-horizon)" />

      {/* Lune + étoiles */}
      <circle cx="96" cy="40" r="18" fill="#f4ecd0" opacity="0.9" />
      <circle cx="88" cy="36" r="15" fill="url(#vil-sky)" opacity="0.6" />
      {[40, 180, 260, 330, 470, 560, 620, 760, 900, 1000, 1100, 1240, 1320].map((x, i) => (
        <circle key={i} cx={x} cy={16 + (i % 4) * 8} r={i % 2 ? 1.2 : 0.8} fill="#fff" opacity="0.4" />
      ))}

      {/* Collines lointaines */}
      <path
        d="M0,128 Q120,108 250,124 Q380,140 520,116 Q600,104 680,122 Q800,108 930,124 Q1060,140 1200,116 Q1280,104 1360,122 L1360,190 L0,190 Z"
        fill="#211a30"
      />

      {/* --- Bâtiments (dupliqués en miroir pour couvrir les écrans larges) --- */}
      <g id="vil-town">

      {/* Maison A */}
      <g>
        <rect x={34} y={118} width={46} height={GY - 118} fill={WALL} />
        <polygon points={`30,120 57,98 84,120`} fill={ROOF} />
        <rect x={52} y={136} width={10} height={16} fill="#150f1e" />
        <Win x={40} y={126} flicker />
        <Win x={68} y={126} />
      </g>

      {/* Maison B + cheminée fumante */}
      <g>
        <rect x={88} y={124} width={38} height={GY - 124} fill="#1e1726" />
        <polygon points={`84,126 105,108 126,126`} fill={ROOF} />
        <rect x={116} y={100} width={7} height={12} fill="#1a1420" />
        <Win x={100} y={132} flicker />
      </g>
      <Smoke x={120} y={100} begin="0s" />
      <Smoke x={120} y={100} begin="1.6s" />

      {/* Forge : fournaise + cheminée */}
      <g>
        <rect x={132} y={112} width={58} height={GY - 112} fill={WALL} />
        <polygon points={`128,114 161,92 194,114`} fill="#43291a" />
        <rect x={176} y={78} width={11} height={22} fill="#241a24" />
        {/* Fournaise incandescente */}
        <circle cx={150} cy={140} r={16} fill="#ff7a2a" opacity="0.35" filter="url(#vil-glow)" />
        <rect x={143} y={134} width={14} height={18} rx="1" fill="#ff7a2a" filter="url(#vil-glow)">
          <animate attributeName="opacity" values="0.8;1;0.85;1" dur="1.6s" repeatCount="indefinite" />
        </rect>
        <Win x={172} y={122} />
      </g>
      <Smoke x={181} y={78} begin="0.4s" />
      <Smoke x={181} y={78} begin="2.2s" />

      {/* Taverne + enseigne qui balance */}
      <g>
        <rect x={210} y={102} width={84} height={GY - 102} fill="#2a2030" />
        <polygon points={`204,104 252,76 300,104`} fill="#4a2e1c" />
        <rect x={244} y={130} width={16} height={22} fill="#150f1e" />
        <Win x={220} y={116} flicker />
        <Win x={238} y={116} />
        <Win x={266} y={116} flicker />
        <Win x={284} y={116} />
        {/* Potence + enseigne */}
        <rect x={300} y={108} width={16} height={2} fill="#1a1420" />
        <g transform="translate(314,110)">
          <animateTransform attributeName="transform" type="rotate" values="-5 0 0;5 0 0;-5 0 0" dur="3.4s" repeatCount="indefinite" additive="sum" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="#1a1420" strokeWidth="1" />
          <rect x={-7} y={6} width={14} height={11} rx="1.5" fill="#e8b64a" />
        </g>
      </g>

      {/* Puits sur la place */}
      <g>
        <ellipse cx={332} cy={150} rx={16} ry={6} fill="#1a1424" />
        <rect x={320} y={138} width={24} height={12} rx="2" fill="#2b2233" />
        <rect x={322} y={120} width={3} height={18} fill="#2a1c14" />
        <rect x={339} y={120} width={3} height={18} fill="#2a1c14" />
        <polygon points={`316,120 332,110 348,120`} fill="#4a2e1c" />
      </g>

      {/* Arbres/buissons pour combler */}
      {[366, 412].map((x, i) => (
        <g key={i}>
          <rect x={x - 2} y={GY - 16} width={4} height={16} fill="#241a14" />
          <circle cx={x} cy={GY - 22} r={12} fill="#1e3320" />
          <circle cx={x - 8} cy={GY - 16} r={9} fill="#1a2c1c" />
          <circle cx={x + 8} cy={GY - 16} r={9} fill="#22381f" />
        </g>
      ))}

      {/* Tour de la Bibliothèque + bannière */}
      <g>
        <rect x={430} y={66} width={38} height={GY - 66} fill="#241b2e" />
        {[430, 438, 446, 454, 462].map((bx) => (
          <rect key={bx} x={bx} y={60} width={5} height={6} fill="#241b2e" />
        ))}
        <Win x={444} y={82} flicker w={8} h={10} />
        <Win x={444} y={104} w={8} h={10} />
        <Win x={444} y={126} flicker w={8} h={10} />
        {/* Bannière */}
        <line x1={449} y1={66} x2={449} y2={48} stroke="#1a1420" strokeWidth="2" />
        <g transform="translate(449,50)">
          <animateTransform attributeName="transform" type="rotate" values="-4 0 0;5 0 0;-4 0 0" dur="3s" repeatCount="indefinite" additive="sum" />
          <polygon points="0,0 24,5 0,11" fill="#8b7cf6" />
        </g>
      </g>

      {/* Hôtel de guilde + fanion */}
      <g>
        <rect x={486} y={106} width={76} height={GY - 106} fill={WALL} />
        <polygon points={`482,108 524,82 566,108`} fill="#4a2e1c" />
        <rect x={516} y={132} width={16} height={20} fill="#150f1e" />
        <Win x={498} y={120} />
        <Win x={520} y={120} flicker />
        <Win x={542} y={120} />
        <line x1={524} y1={82} x2={524} y2={66} stroke="#1a1420" strokeWidth="2" />
        <g transform="translate(524,68)">
          <animateTransform attributeName="transform" type="rotate" values="-5 0 0;5 0 0;-5 0 0" dur="2.7s" repeatCount="indefinite" additive="sum" />
          <polygon points="0,0 22,5 0,10" fill="#f5b544" />
        </g>
      </g>

      {/* Maisons de droite */}
      <g>
        <rect x={580} y={122} width={44} height={GY - 122} fill="#1e1726" />
        <polygon points={`576,124 602,106 628,124`} fill={ROOF} />
        <Win x={590} y={130} flicker />
        <Win x={608} y={130} />
      </g>
      <g>
        <rect x={630} y={128} width={40} height={GY - 128} fill={WALL} />
        <polygon points={`626,130 650,114 674,130`} fill="#43291a" />
        <Win x={644} y={136} />
      </g>
      </g>
      {/* Copie miroir : couvre la moitié droite des écrans larges */}
      <use href="#vil-town" transform="translate(1360,0) scale(-1,1)" />

      {/* Sol + chemin + lampadaires */}
      <rect x="0" y={GY} width="1360" height={190 - GY} fill="#161020" />
      <rect x="0" y={GY} width="1360" height="3" fill="#2a1f34" />
      <path d="M0,178 Q340,168 680,176 Q1020,184 1360,172 L1360,190 L0,190 Z" fill="#221830" opacity="0.8" />
      {[118, 300, 398, 566, 794, 962, 1060, 1248].map((x) => (
        <Lantern key={x} x={x} gy={GY} />
      ))}
    </svg>
  );
}

function Quarter({ title, buildings }: { title: string; buildings: Building[] }) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--color-muted)]">
        {title}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {buildings.map((b) => (
          <BuildingCard key={b.to} building={b} />
        ))}
      </div>
    </div>
  );
}

function BuildingCard({ building: b }: { building: Building }) {
  const unlocks = useUnlocks();
  const alerts = useActionAlerts();
  const locked = !unlocks.unlocked(b.activity);
  const alert = b.activity === 'tavern' && alerts.tavern;
  const reqLabel =
    b.activity === 'tavern'
      ? 'Après ta première défaite'
      : `Niveau de compte ${ACTIVITY_UNLOCKS[b.activity]}`;

  const inner = (
    <>
      {/* Enseigne : barre d'accent à plat */}
      <span
        className="absolute inset-y-0 left-0 w-1.5"
        style={{ background: locked ? 'var(--color-edge-strong)' : b.accent }}
      />
      <NotifDot show={alert} className="right-3 top-3" title="Recrue disponible" />

      <div className="flex items-start gap-4 p-5 pl-6">
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: locked ? 'rgba(255,255,255,0.04)' : `${b.accent}1f` }}
        >
          {b.iconKind === 'glyph' ? (
            <SyntyGlyph src={b.iconSrc} size={38} color={locked ? 'var(--color-muted)' : b.accent} />
          ) : (
            <SyntyImg src={b.iconSrc} size={40} className={locked ? 'opacity-40' : ''} />
          )}
        </div>
        <div className="min-w-0">
          <h4 className="font-display text-base font-bold text-[var(--color-ink)]">{b.title}</h4>
          <p className="text-xs italic text-[var(--color-muted)]">{b.keeper}</p>
          <p className="mt-1.5 text-sm text-[var(--color-muted)]">{b.desc}</p>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-[var(--color-edge)] px-6 py-3 text-sm font-semibold text-[var(--color-muted)]">
        {locked ? (
          <>
            <span className="inline-flex items-center gap-1.5">
              <UiIcon name="lock" size={14} color="currentColor" /> {reqLabel}
            </span>
          </>
        ) : (
          <>
            <span className="transition group-hover:text-[var(--color-ink)]">Entrer</span>
            <span className="transition group-hover:translate-x-0.5">→</span>
          </>
        )}
      </div>
    </>
  );

  if (locked) {
    return (
      <div
        className="panel relative flex cursor-not-allowed flex-col overflow-hidden opacity-70"
        title={`Débloqué : ${reqLabel}`}
      >
        {inner}
      </div>
    );
  }

  return (
    <Link to={b.to} className="panel panel-hover group relative flex flex-col overflow-hidden">
      {inner}
    </Link>
  );
}
