/**
 * Décor d'en-tête de la Joaillerie : atelier de joaillier 100 % SVG dans la DA du jeu.
 * Gemme facettée maîtresse en lévitation sur un coussin de velours, réfraction
 * prismatique tournante, gemmes satellites de couleurs variées qui scintillent,
 * éclats en étoile. Purement décoratif.
 */

function clamp(v: number) {
  return Math.max(0, Math.min(255, Math.round(v)));
}
function mix(hex: string, target: number, f: number) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  const m = (v: number) => clamp(v + (target - v) * f);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}
const darken = (h: string, f: number) => mix(h, 0, f);
const lighten = (h: string, f: number) => mix(h, 255, f);

/** Gemme taille brillant : couronne facettée + pavillon en pointe + éclat mobile. */
function Gem({ color, size = 30, twinkle = 0 }: { color: string; size?: number; twinkle?: number }) {
  const w = size * 0.62;
  const tx = size * 0.3;
  const H = size * 0.5; // table (haut)
  const g = size * 0.16; // ceinture
  const B = size * 0.72; // pointe (bas)
  const dark = darken(color, 0.4);
  const mid = darken(color, 0.18);
  const light = lighten(color, 0.35);
  return (
    <g>
      {/* pavillon */}
      <polygon points={`${-w},${-g} ${w},${-g} 0,${B}`} fill={dark} />
      <polygon points={`${-w},${-g} 0,${-g} 0,${B}`} fill={mid} />
      <polygon points={`0,${-g} ${w * 0.5},${-g} 0,${B}`} fill={color} opacity="0.7" />
      {/* couronne */}
      <polygon points={`${-tx},${-H} ${tx},${-H} ${w},${-g} ${-w},${-g}`} fill={color} />
      <polygon points={`${-tx},${-H} ${tx},${-H} ${tx * 0.4},${-g} ${-tx * 0.4},${-g}`} fill={light} />
      <polygon points={`${tx},${-H} ${w},${-g} ${tx * 0.4},${-g}`} fill={mid} />
      {/* table + arêtes */}
      <line x1={-tx} y1={-H} x2={tx} y2={-H} stroke={lighten(color, 0.55)} strokeWidth={size * 0.03} />
      <line x1={0} y1={-g} x2={0} y2={B} stroke={dark} strokeWidth={size * 0.02} />
      {/* éclat mobile */}
      <polygon points={`0,-${H} 2,-2 8,0 2,2`} fill="#fff" opacity="0.9" transform={`translate(${-tx * 0.3},${-H * 0.4}) scale(0.5)`}>
        <animate attributeName="opacity" values="0.2;1;0.2" dur={`${1.8 + twinkle}s`} repeatCount="indefinite" />
      </polygon>
    </g>
  );
}

/** Petite étoile d'éclat à 4 branches. */
function Sparkle({ x, y, s = 5, begin = '0s', color = '#fff' }: { x: number; y: number; s?: number; begin?: string; color?: string }) {
  return (
    <g transform={`translate(${x},${y})`} fill={color} filter="url(#jw-glow)">
      <animate attributeName="opacity" values="0;1;0" dur="2.2s" begin={begin} repeatCount="indefinite" />
      <path d={`M0,${-s} L${s * 0.2},${-s * 0.2} L${s},0 L${s * 0.2},${s * 0.2} L0,${s} L${-s * 0.2},${s * 0.2} L${-s},0 L${-s * 0.2},${-s * 0.2} Z`} />
    </g>
  );
}

const GEMS = ['#ff5a7a', '#4fd39b', '#5b8cff', '#b467d6', '#f5b544'];

export function JewelScene() {
  const cx = 340;
  const cy = 84;
  return (
    <svg viewBox="0 0 680 190" className="block h-auto w-full" role="img" aria-label="Joaillerie">
      <defs>
        <linearGradient id="jw-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#150f22" />
          <stop offset="100%" stopColor="#251636" />
        </linearGradient>
        <radialGradient id="jw-spot" cx="0.5" cy="0.1" r="0.7">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="jw-velvet" cx="0.5" cy="0.4" r="0.6">
          <stop offset="0%" stopColor="#3a2450" />
          <stop offset="100%" stopColor="#1a1028" />
        </radialGradient>
        <filter id="jw-glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="1.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="jw-blur" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      <rect x="0" y="0" width="680" height="190" fill="url(#jw-sky)" />
      <rect x="0" y="0" width="680" height="190" fill="url(#jw-spot)" />

      {/* Réfraction prismatique tournante derrière la gemme maîtresse */}
      <g opacity="0.5" filter="url(#jw-blur)">
        <animateTransform attributeName="transform" type="rotate" values={`0 ${cx} ${cy};360 ${cx} ${cy}`} dur="40s" repeatCount="indefinite" />
        {['#ff5a7a', '#f5b544', '#4fd39b', '#5b8cff', '#b467d6', '#ff5a7a'].map((c, i) => (
          <polygon key={i} points={`${cx},${cy} ${cx - 6},${cy + 150} ${cx + 6},${cy + 150}`} fill={c} opacity="0.12" transform={`rotate(${i * 60} ${cx} ${cy})`} />
        ))}
      </g>

      {/* Halo clair central */}
      <ellipse cx={cx} cy={cy} rx="120" ry="100" fill="#c9a8ff" opacity="0.12" filter="url(#jw-blur)" />

      {/* Coussin de velours + présentoir */}
      <g>
        <ellipse cx={cx} cy={182} rx="150" ry="10" fill="#000" opacity="0.35" />
        <ellipse cx={cx} cy={162} rx="150" ry="26" fill="url(#jw-velvet)" />
        <ellipse cx={cx} cy={158} rx="150" ry="24" fill="none" stroke="#4a2f66" strokeWidth="1.5" />
        {/* gemmes satellites présentées sur le velours */}
        {GEMS.map((c, i) => {
          const t = (i - (GEMS.length - 1) / 2) / (GEMS.length - 1);
          const x = cx + t * 210;
          const y = 158 + Math.abs(t) * 6;
          return (
            <g key={i} transform={`translate(${x},${y})`}>
              <ellipse cx={0} cy={10} rx="12" ry="3.4" fill="#000" opacity="0.3" />
              <g transform="translate(0,2)">
                <Gem color={c} size={22} twinkle={i * 0.4} />
              </g>
            </g>
          );
        })}
      </g>

      {/* Gemme maîtresse en lévitation */}
      <g transform={`translate(${cx},${cy})`}>
        <animateTransform attributeName="transform" type="translate" values={`${cx} ${cy};${cx} ${cy - 6};${cx} ${cy}`} dur="3.8s" repeatCount="indefinite" />
        <circle r="30" fill="#dbeafe" opacity="0.18" filter="url(#jw-blur)">
          <animate attributeName="opacity" values="0.12;0.28;0.12" dur="2.4s" repeatCount="indefinite" />
        </circle>
        <g filter="url(#jw-glow)">
          <Gem color="#9fdcff" size={54} />
        </g>
      </g>

      {/* Éclats en étoile qui pétillent */}
      <Sparkle x={cx} y={cy - 30} s={7} begin="0s" />
      <Sparkle x={cx + 34} y={cy + 6} s={5} begin="0.7s" />
      <Sparkle x={cx - 32} y={cy + 2} s={5} begin="1.3s" />
      <Sparkle x={180} y={70} s={5} begin="0.4s" color="#ffd7e6" />
      <Sparkle x={510} y={64} s={5} begin="1.1s" color="#cfe8ff" />
      <Sparkle x={430} y={44} s={4} begin="1.7s" color="#d8ffe8" />
      <Sparkle x={250} y={48} s={4} begin="0.9s" color="#efd8ff" />
    </svg>
  );
}
