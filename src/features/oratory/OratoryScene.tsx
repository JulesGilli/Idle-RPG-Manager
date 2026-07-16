/**
 * Décor d'en-tête de l'Oratoire Astral : scène 100 % SVG dans la DA du jeu.
 *
 * Le récit de la bénédiction, en une image : une LARME ASTRALE se détache de la
 * constellation, tombe, et frappe la lame en lévitation — qui s'embrase de rouge.
 * Tout le reste (rosace, colonnes, brasiers, poussière) n'est là que pour porter
 * ce geste. La boucle dure 6 s : chute, impact, embrasement, apaisement.
 *
 * Rouge et non or : les étoiles de bénédiction sont ROUGES en jeu (BlessingStars),
 * l'Autel des Reliques a déjà l'or. Purement décoratif.
 */

const CRIMSON = '#fb7185';
const CRIMSON_DEEP = '#9f1239';
const EMBER = '#f43f5e';
const NIGHT_INK = '#e7d9ff';
const STAR = '#fff4f6';

/** Constellation d'où tombe la larme — la Vesper, l'étoile du soir. */
const CONSTELLATION: [number, number][] = [
  [268, 34],
  [300, 22],
  [340, 38],
  [372, 24],
  [404, 40],
];

export function OratoryScene() {
  const cx = 340;
  /** Point d'impact = la lame. Toute la scène converge ici. */
  const bladeY = 104;

  return (
    <svg viewBox="0 0 680 190" className="block h-auto w-full" role="img" aria-label="Oratoire Astral">
      <defs>
        <linearGradient id="or-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0d0813" />
          <stop offset="60%" stopColor="#1a0d1c" />
          <stop offset="100%" stopColor="#2a0f1a" />
        </linearGradient>
        <radialGradient id="or-core" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor={CRIMSON} stopOpacity="0.45" />
          <stop offset="55%" stopColor={CRIMSON_DEEP} stopOpacity="0.16" />
          <stop offset="100%" stopColor={CRIMSON_DEEP} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="or-rose" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor={NIGHT_INK} stopOpacity="0.22" />
          <stop offset="100%" stopColor={CRIMSON_DEEP} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="or-stone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b2536" />
          <stop offset="100%" stopColor="#180b14" />
        </linearGradient>
        <linearGradient id="or-blade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" />
          <stop offset="50%" stopColor="#d9c9e8" />
          <stop offset="100%" stopColor="#8b7a9e" />
        </linearGradient>
        <filter id="or-glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="1.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="or-blur" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>

      <rect x="0" y="0" width="680" height="190" fill="url(#or-sky)" />

      {/* Champ d'étoiles — le firmament d'où vient la larme. */}
      {[
        [40, 30], [92, 58], [150, 22], [196, 70], [232, 44], [470, 30], [512, 62],
        [560, 26], [604, 56], [642, 36], [66, 96], [618, 100], [128, 128], [572, 132],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 1.4 : 0.9} fill={STAR} opacity="0.7">
          <animate attributeName="opacity" values="0.25;0.9;0.25" dur={`${2.4 + (i % 4) * 0.7}s`} begin={`${i * 0.3}s`} repeatCount="indefinite" />
        </circle>
      ))}

      {/* Rosace : le vitrail de l'oratoire, derrière la lame. */}
      <g opacity="0.85">
        <circle cx={cx} cy={bladeY - 8} r="66" fill="url(#or-rose)" />
        <circle cx={cx} cy={bladeY - 8} r="66" fill="none" stroke={CRIMSON_DEEP} strokeWidth="1.5" opacity="0.55" />
        <circle cx={cx} cy={bladeY - 8} r="44" fill="none" stroke={CRIMSON_DEEP} strokeWidth="1" opacity="0.4" />
        {/* Meneaux : 12 rayons + pétales, comme une vraie rosace. */}
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return (
            <line
              key={i}
              x1={cx + Math.cos(a) * 22}
              y1={bladeY - 8 + Math.sin(a) * 22}
              x2={cx + Math.cos(a) * 66}
              y2={bladeY - 8 + Math.sin(a) * 66}
              stroke={CRIMSON_DEEP}
              strokeWidth="0.9"
              opacity="0.35"
            />
          );
        })}
        {Array.from({ length: 6 }, (_, i) => {
          const a = (i / 6) * Math.PI * 2;
          const px = cx + Math.cos(a) * 44;
          const py = bladeY - 8 + Math.sin(a) * 44;
          return <circle key={i} cx={px} cy={py} r="7" fill={CRIMSON} opacity="0.14" />;
        })}
      </g>

      {/* Colonnes gothiques + brasiers : l'oratoire est un lieu, pas un fond. */}
      {[104, 576].map((px, i) => (
        <g key={i} transform={`translate(${px},0)`}>
          <path d="M-13,176 L-13,74 Q0,58 13,74 L13,176 Z" fill="url(#or-stone)" />
          <path d="M-13,74 Q0,58 13,74" fill="none" stroke={CRIMSON_DEEP} strokeWidth="1.2" opacity="0.6" />
          <rect x={-18} y={172} width={36} height={6} rx={2} fill="#2a1622" />
          {/* Vasque + flamme rouge */}
          <path d="M-11,74 L11,74 L7,64 L-7,64 Z" fill="#2a1622" stroke={CRIMSON_DEEP} strokeWidth="1" />
          <path d="M0,64 Q-5,52 0,40 Q5,52 0,64 Z" fill={EMBER} filter="url(#or-glow)" opacity="0.9">
            <animate attributeName="d" values="M0,64 Q-5,52 0,40 Q5,52 0,64 Z;M0,64 Q-4,50 0.8,36 Q5.5,52 0,64 Z;M0,64 Q-5,52 0,40 Q5,52 0,64 Z" dur={`${1.3 + i * 0.25}s`} repeatCount="indefinite" />
          </path>
          <path d="M0,62 Q-2,52 0,45 Q2,52 0,62 Z" fill={STAR} opacity="0.85">
            <animate attributeName="opacity" values="0.5;1;0.5" dur="1s" repeatCount="indefinite" />
          </path>
        </g>
      ))}

      {/* Constellation de la Vesper : la larme s'en détache. */}
      <g>
        <polyline
          points={CONSTELLATION.map(([x, y]) => `${x},${y}`).join(' ')}
          fill="none"
          stroke={NIGHT_INK}
          strokeWidth="0.7"
          opacity="0.35"
        />
        {CONSTELLATION.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i === 2 ? 2.6 : 1.6} fill={STAR} filter="url(#or-glow)">
            <animate attributeName="opacity" values="0.5;1;0.5" dur={`${2 + i * 0.4}s`} repeatCount="indefinite" />
          </circle>
        ))}
      </g>

      {/* Halo d'impact : gonfle quand la larme touche la lame (t≈2.2s). */}
      <ellipse cx={cx} cy={bladeY} rx="130" ry="104" fill="url(#or-core)" filter="url(#or-blur)">
        <animate attributeName="opacity" values="0.25;0.25;1;0.45;0.25" keyTimes="0;0.33;0.4;0.62;1" dur="6s" repeatCount="indefinite" />
      </ellipse>

      {/* LA LARME ASTRALE : se détache de l'étoile centrale et tombe sur la lame. */}
      <g filter="url(#or-glow)">
        <animateTransform
          attributeName="transform"
          type="translate"
          values={`0 0; 0 0; 0 ${bladeY - 38 - 4}; 0 ${bladeY - 38 - 4}`}
          keyTimes="0;0.17;0.4;1"
          keySplines="0 0 1 1; 0.55 0 0.9 0.6; 0 0 1 1"
          calcMode="spline"
          dur="6s"
          repeatCount="indefinite"
        />
        {/* Traînée */}
        <path d={`M${cx},34 L${cx - 1.6},22 L${cx + 1.6},22 Z`} fill={STAR} opacity="0">
          <animate attributeName="opacity" values="0;0;0.75;0;0" keyTimes="0;0.17;0.3;0.4;1" dur="6s" repeatCount="indefinite" />
        </path>
        {/* La goutte : pointe en haut, ventre en bas. */}
        <path d={`M${cx},34 Q${cx - 4.6},42 ${cx},46.5 Q${cx + 4.6},42 ${cx},34 Z`} fill={STAR}>
          <animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;0.16;0.2;0.39;0.42;1" dur="6s" repeatCount="indefinite" />
        </path>
      </g>

      {/* Onde de choc au point d'impact. */}
      <circle cx={cx} cy={bladeY - 34} r="4" fill="none" stroke={CRIMSON} strokeWidth="1.6" opacity="0">
        <animate attributeName="r" values="4;4;30" keyTimes="0;0.4;0.58" dur="6s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0;0;0.9;0" keyTimes="0;0.4;0.42;0.58" dur="6s" repeatCount="indefinite" />
      </circle>

      {/* LA LAME en lévitation — l'objet du rituel. */}
      <g>
        <animateTransform attributeName="transform" type="translate" values={`${cx} ${bladeY};${cx} ${bladeY - 5};${cx} ${bladeY}`} dur="4.5s" repeatCount="indefinite" />
        {/* Aura : s'embrase à l'impact. */}
        <ellipse rx="26" ry="46" fill={CRIMSON} opacity="0.18" filter="url(#or-blur)">
          <animate attributeName="opacity" values="0.12;0.12;0.6;0.2;0.12" keyTimes="0;0.38;0.44;0.7;1" dur="6s" repeatCount="indefinite" />
        </ellipse>
        {/* Épée pointe en bas : garde en haut, lame vers l'autel. */}
        <g transform="translate(0,-34)">
          <rect x={-1.6} y={0} width={3.2} height={14} fill={CRIMSON_DEEP} />
          <circle cy={-2} r="3" fill={CRIMSON} />
          <rect x={-13} y={14} width={26} height={3.4} rx={1.4} fill={CRIMSON_DEEP} />
          <path d="M-5.2,17 L5.2,17 L3.4,64 L0,72 L-3.4,64 Z" fill="url(#or-blade)" />
          {/* Gorge de la lame, qui s'allume au moment de la bénédiction. */}
          <path d="M0,19 L0,66" stroke={EMBER} strokeWidth="1.1" opacity="0" filter="url(#or-glow)">
            <animate attributeName="opacity" values="0;0;1;0.55;0.55" keyTimes="0;0.4;0.46;0.66;1" dur="6s" repeatCount="indefinite" />
          </path>
        </g>
      </g>

      {/* Runes en cercle sous la lame : tournent, et pulsent à l'impact. */}
      <g opacity="0.75">
        <animateTransform attributeName="transform" type="rotate" values={`0 ${cx} ${bladeY + 46};360 ${cx} ${bladeY + 46}`} dur="24s" repeatCount="indefinite" />
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2;
          const rx = cx + Math.cos(a) * 46;
          const ry = bladeY + 46 + Math.sin(a) * 13;
          return (
            <path key={i} d={`M${rx},${ry - 3.4} L${rx + 2.4},${ry} L${rx},${ry + 3.4} L${rx - 2.4},${ry} Z`} fill={CRIMSON}>
              <animate attributeName="opacity" values="0.3;0.3;1;0.3" keyTimes="0;0.4;0.46;0.75" dur="6s" begin={`${i * 0.05}s`} repeatCount="indefinite" />
            </path>
          );
        })}
      </g>

      {/* Socle de pierre. */}
      <g>
        <ellipse cx={cx} cy={178} rx="64" ry="6" fill="#000" opacity="0.45" />
        <polygon points={`${cx - 54},176 ${cx + 54},176 ${cx + 41},159 ${cx - 41},159`} fill="url(#or-stone)" />
        <rect x={cx - 41} y={152} width={82} height={8} fill="#3b2536" />
        <rect x={cx - 41} y={152} width={82} height={2.6} fill={CRIMSON_DEEP} opacity="0.8" />
        <line x1={cx - 30} y1={168} x2={cx + 30} y2={168} stroke={CRIMSON} strokeWidth="1.3" strokeDasharray="3 4" filter="url(#or-glow)">
          <animate attributeName="opacity" values="0.35;0.9;0.35" dur="3s" repeatCount="indefinite" />
        </line>
      </g>

      {/* Braises ascendantes — l'inverse de la larme qui tombe. */}
      {[214, 268, 300, 386, 420, 466, 342].map((x, i) => (
        <circle key={i} cx={x} cy={150} r={i % 2 ? 1.4 : 0.9} fill={i % 3 === 0 ? STAR : CRIMSON} filter="url(#or-glow)">
          <animate attributeName="cy" values="150;44" dur={`${4.5 + (i % 3)}s`} begin={`${i * 0.6}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;0.85;0" dur={`${4.5 + (i % 3)}s`} begin={`${i * 0.6}s`} repeatCount="indefinite" />
        </circle>
      ))}
    </svg>
  );
}
