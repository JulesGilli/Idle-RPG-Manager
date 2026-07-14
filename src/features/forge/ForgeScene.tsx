/**
 * Décor d'en-tête de la Forge : scène chaude 100 % SVG dans la DA du jeu — fourneau
 * incandescent, enclume avec un lingot chauffé à blanc, marteau qui frappe en rythme
 * et projette une gerbe d'étincelles, râtelier d'outils, braises qui montent.
 * Purement décoratif. Cycle de frappe synchronisé sur 1,6 s (marteau + étincelles).
 */

const GOLD = '#f5b544';
const EMBER = '#ff7a2a';
const HOT = '#ffd27a';
const STEEL = '#c8ceda';
const STEEL_DARK = '#8b93a2';
const WOOD = '#6b4423';

const STRIKE = '1.6s';

/** Directions des étincelles projetées à l'impact (dx, dy en unités SVG). */
const SPARKS: [number, number][] = [
  [-26, -20], [-14, -30], [0, -34], [16, -30], [28, -18], [-8, -26], [10, -28],
];

export function ForgeScene() {
  return (
    <svg viewBox="0 0 680 190" className="block h-auto w-full" role="img" aria-label="Forge">
      <defs>
        <linearGradient id="fg-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1c1310" />
          <stop offset="100%" stopColor="#2e1d12" />
        </linearGradient>
        <radialGradient id="fg-heat" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor={HOT} stopOpacity="0.5" />
          <stop offset="55%" stopColor={EMBER} stopOpacity="0.18" />
          <stop offset="100%" stopColor={EMBER} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="fg-mouth" cx="0.5" cy="0.6" r="0.6">
          <stop offset="0%" stopColor="#fff1c8" />
          <stop offset="45%" stopColor={GOLD} />
          <stop offset="100%" stopColor="#7a1e08" />
        </radialGradient>
        <linearGradient id="fg-stone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4a3a2a" />
          <stop offset="100%" stopColor="#241812" />
        </linearGradient>
        <filter id="fg-glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="1.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="fg-blur" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>

      {/* Fond chaud */}
      <rect x="0" y="0" width="680" height="190" fill="url(#fg-sky)" />

      {/* Lueur de chaleur globale derrière l'enclume */}
      <ellipse cx="340" cy="120" rx="180" ry="120" fill="url(#fg-heat)" filter="url(#fg-blur)" />

      {/* Braises qui flottent */}
      {[120, 210, 300, 400, 470, 560, 250, 430].map((x, i) => (
        <circle key={i} cx={x} cy={150} r={i % 2 ? 1.5 : 1} fill={i % 3 === 0 ? HOT : EMBER} filter="url(#fg-glow)">
          <animate attributeName="cy" values="150;30" dur={`${4 + (i % 3)}s`} begin={`${i * 0.5}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;0.9;0" dur={`${4 + (i % 3)}s`} begin={`${i * 0.5}s`} repeatCount="indefinite" />
        </circle>
      ))}

      {/* ---- Fourneau (gauche) ---- */}
      <g>
        <rect x="66" y="70" width="118" height="104" fill="url(#fg-stone)" />
        <rect x="60" y="66" width="130" height="8" rx="2" fill="#52402e" />
        {/* cheminée */}
        <rect x="150" y="30" width="24" height="40" fill="url(#fg-stone)" />
        <rect x="146" y="26" width="32" height="7" rx="2" fill="#52402e" />
        {/* fumée */}
        {[0, 1, 2].map((k) => (
          <circle key={k} cx={162} cy={26} r={5} fill="#3a2e24" opacity="0">
            <animate attributeName="cy" values="26;-6" dur="4s" begin={`${k * 1.3}s`} repeatCount="indefinite" />
            <animate attributeName="r" values="3;11" dur="4s" begin={`${k * 1.3}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;0.4;0" dur="4s" begin={`${k * 1.3}s`} repeatCount="indefinite" />
          </circle>
        ))}
        {/* gueule incandescente */}
        <path d="M92,150 L92,108 Q92,92 125,92 Q158,92 158,108 L158,150 Z" fill="#1a0d06" />
        <path d="M99,150 L99,110 Q99,100 125,100 Q151,100 151,110 L151,150 Z" fill="url(#fg-mouth)">
          <animate attributeName="opacity" values="0.85;1;0.85" dur="1.3s" repeatCount="indefinite" />
        </path>
        {/* flammes dans la gueule */}
        {[112, 125, 138].map((fx, i) => (
          <path key={i} d={`M${fx},148 Q${fx - 5},130 ${fx},116 Q${fx + 5},130 ${fx},148 Z`} fill={i === 1 ? HOT : GOLD} filter="url(#fg-glow)">
            <animate attributeName="d" values={`M${fx},148 Q${fx - 5},130 ${fx},116 Q${fx + 5},130 ${fx},148 Z;M${fx},148 Q${fx - 4},128 ${fx + 1},112 Q${fx + 5},130 ${fx},148 Z;M${fx},148 Q${fx - 5},130 ${fx},116 Q${fx + 5},130 ${fx},148 Z`} dur={`${1.1 + i * 0.2}s`} repeatCount="indefinite" />
          </path>
        ))}
        {/* halo de la gueule */}
        <ellipse cx="125" cy="122" rx="46" ry="40" fill={EMBER} opacity="0.16" filter="url(#fg-blur)" />
      </g>

      {/* ---- Râtelier d'outils (droite) ---- */}
      <g transform="translate(566,0)">
        <rect x="-4" y="60" width="8" height="112" fill={WOOD} />
        <rect x="-34" y="58" width="68" height="6" rx="2" fill="#52402e" />
        {/* marteau accroché */}
        <g transform="translate(-24,64)">
          <line x1="0" y1="0" x2="0" y2="34" stroke={WOOD} strokeWidth="3" />
          <rect x="-7" y="-2" width="14" height="8" rx="1.5" fill={STEEL_DARK} />
        </g>
        {/* tenailles */}
        <g transform="translate(24,64)" stroke={STEEL_DARK} strokeWidth="2.4" fill="none" strokeLinecap="round">
          <path d="M0,0 L-4,30" />
          <path d="M0,0 L4,30" />
          <circle cx="0" cy="2" r="2.2" fill={STEEL_DARK} stroke="none" />
        </g>
      </g>

      {/* ---- Enclume (centre) ---- */}
      <g>
        {/* billot */}
        <rect x="316" y="150" width="48" height="30" rx="2" fill={WOOD} />
        <rect x="316" y="150" width="48" height="5" fill="#7d5228" />
        <ellipse cx="340" cy="181" rx="30" ry="4" fill="#000" opacity="0.35" />
        {/* enclume : table + corne + pied */}
        <path d="M300,150 L380,150 L380,142 L360,142 L356,132 L324,132 L322,142 L300,142 Z" fill="#2f353d" />
        <path d="M300,142 L302,132 L294,136 Z" fill="#2f353d" />
        <path d="M300,150 L380,150 L380,142 L300,142 Z" fill="#3d454e" />
        <rect x="330" y="150" width="20" height="2" fill="#20262c" />
        {/* lingot chauffé sur la table */}
        <rect x="326" y="126" width="30" height="6" rx="1.5" fill="url(#fg-mouth)" filter="url(#fg-glow)">
          <animate attributeName="opacity" values="0.8;1;0.8" dur={STRIKE} repeatCount="indefinite" />
        </rect>
        <rect x="330" y="127" width="20" height="2" fill="#fff6e0" opacity="0.8" />
      </g>

      {/* ---- Marteau qui frappe ---- */}
      <g>
        <animateTransform attributeName="transform" type="rotate" values="-48 372 94;-6 372 94;-6 372 94;-48 372 94" keyTimes="0;0.5;0.58;1" dur={STRIKE} repeatCount="indefinite" />
        <line x1="372" y1="94" x2="344" y2="126" stroke={WOOD} strokeWidth="4" strokeLinecap="round" />
        <g transform="translate(342,127) rotate(48)">
          <rect x="-6" y="-9" width="12" height="18" rx="2" fill={STEEL_DARK} />
          <rect x="-6" y="-9" width="12" height="6" rx="2" fill={STEEL} />
        </g>
      </g>

      {/* ---- Gerbe d'étincelles (synchronisée sur l'impact ~0,5) ---- */}
      <g transform="translate(340,128)">
        {SPARKS.map(([dx, dy], i) => (
          <circle key={i} r={i % 2 ? 2.2 : 1.5} fill={i % 2 ? HOT : GOLD} filter="url(#fg-glow)">
            <animate attributeName="opacity" values="0;0;1;0" keyTimes="0;0.48;0.52;0.78" dur={STRIKE} repeatCount="indefinite" />
            <animateTransform attributeName="transform" type="translate" values={`0 0;0 0;${dx} ${dy};${dx * 1.6} ${dy * 0.2}`} keyTimes="0;0.48;0.56;0.78" dur={STRIKE} repeatCount="indefinite" />
          </circle>
        ))}
        {/* flash d'impact */}
        <circle r="0" fill="#fff6e0" filter="url(#fg-glow)">
          <animate attributeName="r" values="0;0;11;0" keyTimes="0;0.48;0.52;0.64" dur={STRIKE} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;0;0.95;0" keyTimes="0;0.48;0.52;0.64" dur={STRIKE} repeatCount="indefinite" />
        </circle>
      </g>
    </svg>
  );
}
