/**
 * Décor d'en-tête de l'Autel des Reliques : scène sacrée 100 % SVG dans la DA du jeu.
 * Arche de temple lumineuse, monstrance dorée (relique rayonnante en lévitation) dans
 * un soleil d'or tournant, candélabres à triple flamme, halo, poussière d'or ascendante.
 * Purement décoratif.
 */

const GOLD = '#f5b544';
const GOLD_SOFT = '#ffe6a8';
const GOLD_DEEP = '#a9711e';
const CREAM = '#fff6da';

/** Soleil d'or : couronne de rayons triangulaires autour d'un centre (monstrance). */
function Sunburst({ n = 16, inner, outer }: { n?: number; inner: number; outer: number }) {
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        const long = i % 2 === 0;
        const r = long ? outer : outer * 0.72;
        const wx = Math.cos(a + Math.PI / 2) * 3.2;
        const wy = Math.sin(a + Math.PI / 2) * 3.2;
        const ix = Math.cos(a) * inner;
        const iy = Math.sin(a) * inner;
        const ox = Math.cos(a) * r;
        const oy = Math.sin(a) * r;
        return (
          <polygon
            key={i}
            points={`${ix - wx},${iy - wy} ${ix + wx},${iy + wy} ${ox},${oy}`}
            fill={long ? GOLD : GOLD_DEEP}
          />
        );
      })}
    </g>
  );
}

export function RelicScene() {
  const cx = 340;
  const cy = 86;
  return (
    <svg viewBox="0 0 680 190" className="block h-auto w-full" role="img" aria-label="Autel des Reliques">
      <defs>
        <linearGradient id="rl-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1b1509" />
          <stop offset="100%" stopColor="#2c2110" />
        </linearGradient>
        <radialGradient id="rl-core" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor={CREAM} stopOpacity="0.7" />
          <stop offset="55%" stopColor={GOLD} stopOpacity="0.2" />
          <stop offset="100%" stopColor={GOLD} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="rl-window" cx="0.5" cy="0.35" r="0.7">
          <stop offset="0%" stopColor={GOLD_SOFT} stopOpacity="0.4" />
          <stop offset="100%" stopColor={GOLD} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="rl-stone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4a3d28" />
          <stop offset="100%" stopColor="#241c10" />
        </linearGradient>
        <filter id="rl-glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="1.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="rl-blur" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>

      <rect x="0" y="0" width="680" height="190" fill="url(#rl-sky)" />

      {/* Vitrail cintré lumineux derrière l'autel */}
      <g>
        <path d={`M${cx - 70},176 L${cx - 70},70 Q${cx},18 ${cx + 70},70 L${cx + 70},176 Z`} fill="url(#rl-window)" />
        <path d={`M${cx - 70},176 L${cx - 70},70 Q${cx},18 ${cx + 70},70 L${cx + 70},176 Z`} fill="none" stroke={GOLD_DEEP} strokeWidth="1.5" opacity="0.5" />
        <line x1={cx} y1="30" x2={cx} y2="176" stroke={GOLD_DEEP} strokeWidth="1" opacity="0.3" />
        <line x1={cx - 40} y1="60" x2={cx - 40} y2="176" stroke={GOLD_DEEP} strokeWidth="1" opacity="0.25" />
        <line x1={cx + 40} y1="60" x2={cx + 40} y2="176" stroke={GOLD_DEEP} strokeWidth="1" opacity="0.25" />
      </g>

      {/* Halo diffus central */}
      <ellipse cx={cx} cy={cy} rx="150" ry="120" fill="url(#rl-core)" filter="url(#rl-blur)" />

      {/* Rais de lumière divins tournants */}
      <g opacity="0.55">
        <animateTransform attributeName="transform" type="rotate" values={`0 ${cx} ${cy};360 ${cx} ${cy}`} dur="70s" repeatCount="indefinite" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <polygon key={a} points={`${cx},${cy} ${cx - 7},${cy + 160} ${cx + 7},${cy + 160}`} fill={GOLD_SOFT} opacity="0.06" transform={`rotate(${a} ${cx} ${cy})`} />
        ))}
      </g>

      {/* Candélabres latéraux (triple flamme) */}
      {[112, 568].map((px, i) => (
        <g key={i} transform={`translate(${px},0)`}>
          <rect x={-3} y={96} width={6} height={78} fill={GOLD_DEEP} />
          <rect x={-16} y={170} width={32} height={6} rx={2} fill={GOLD_DEEP} />
          <path d="M-22,96 Q0,86 22,96" stroke={GOLD} strokeWidth="3" fill="none" />
          {[-22, 0, 22].map((bx, k) => (
            <g key={k} transform={`translate(${bx},92)`}>
              <rect x={-2} y={0} width={4} height={6} fill={GOLD_SOFT} />
              <path d="M0,0 Q-3.5,-9 0,-18 Q3.5,-9 0,0 Z" fill={GOLD} filter="url(#rl-glow)">
                <animate attributeName="d" values="M0,0 Q-3.5,-9 0,-18 Q3.5,-9 0,0 Z;M0,0 Q-3,-8 0.5,-16 Q3.5,-9 0,0 Z;M0,0 Q-3.5,-9 0,-18 Q3.5,-9 0,0 Z" dur={`${1.1 + k * 0.2}s`} repeatCount="indefinite" />
              </path>
              <path d="M0,-2 Q-1.6,-8 0,-12 Q1.6,-8 0,-2 Z" fill={CREAM}>
                <animate attributeName="opacity" values="0.6;1;0.6" dur="0.9s" repeatCount="indefinite" />
              </path>
            </g>
          ))}
        </g>
      ))}

      {/* Autel de pierre à filigrane doré */}
      <g>
        <ellipse cx={cx} cy={178} rx="70" ry="6" fill="#000" opacity="0.4" />
        <polygon points={`${cx - 60},176 ${cx + 60},176 ${cx + 46},158 ${cx - 46},158`} fill="url(#rl-stone)" />
        <rect x={cx - 46} y={150} width={92} height={9} fill="#52432a" />
        <rect x={cx - 46} y={150} width={92} height={3} fill={GOLD_DEEP} opacity="0.7" />
        {/* inscription sacrée qui luit */}
        <line x1={cx - 34} y1={168} x2={cx + 34} y2={168} stroke={GOLD_SOFT} strokeWidth="1.4" strokeDasharray="3 4" filter="url(#rl-glow)">
          <animate attributeName="opacity" values="0.4;0.9;0.4" dur="3s" repeatCount="indefinite" />
        </line>
      </g>

      {/* Monstrance (relique rayonnante) en lévitation */}
      <g transform={`translate(${cx},${cy})`}>
        <animateTransform attributeName="transform" type="translate" values={`${cx} ${cy};${cx} ${cy - 6};${cx} ${cy}`} dur="4s" repeatCount="indefinite" />
        <circle r="40" fill={GOLD} opacity="0.22" filter="url(#rl-blur)">
          <animate attributeName="opacity" values="0.14;0.3;0.14" dur="2.6s" repeatCount="indefinite" />
        </circle>
        {/* soleil d'or tournant */}
        <g filter="url(#rl-glow)">
          <animateTransform attributeName="transform" type="rotate" values="0;360" dur="26s" repeatCount="indefinite" />
          <Sunburst n={16} inner={20} outer={38} />
        </g>
        {/* anneau + gemme centrale */}
        <circle r="18" fill="#2a2010" stroke={GOLD} strokeWidth="2" />
        <circle r="18" fill="none" stroke={GOLD_SOFT} strokeWidth="0.8" opacity="0.6" />
        <polygon points="0,-13 9,0 0,13 -9,0" fill={GOLD} />
        <polygon points="0,-13 3,0 0,13 -3,0" fill={CREAM} />
        <circle r="3" fill="#fff">
          <animate attributeName="opacity" values="0.7;1;0.7" dur="1.8s" repeatCount="indefinite" />
        </circle>
        {/* petites gemmes serties sur l'anneau */}
        {[0, 90, 180, 270].map((a) => {
          const r = (a * Math.PI) / 180;
          return <circle key={a} cx={Math.cos(r) * 18} cy={Math.sin(r) * 18} r="1.8" fill={GOLD_SOFT} />;
        })}
      </g>

      {/* Halo circulaire qui tourne */}
      <g>
        <animateTransform attributeName="transform" type="rotate" values={`0 ${cx} ${cy};360 ${cx} ${cy}`} dur="14s" repeatCount="indefinite" />
        <ellipse cx={cx} cy={cy} rx="52" ry="16" fill="none" stroke={GOLD_SOFT} strokeWidth="1" opacity="0.4" />
      </g>

      {/* Poussière d'or ascendante + éclats */}
      {[200, 290, 390, 470, 250, 430, 320].map((x, i) => (
        <circle key={i} cx={x} cy={150} r={i % 2 ? 1.5 : 1} fill={i % 3 === 0 ? CREAM : GOLD_SOFT} filter="url(#rl-glow)">
          <animate attributeName="cy" values="150;30" dur={`${4 + (i % 3)}s`} begin={`${i * 0.5}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;0.9;0" dur={`${4 + (i % 3)}s`} begin={`${i * 0.5}s`} repeatCount="indefinite" />
        </circle>
      ))}
      {[[160, 60], [520, 66], [430, 40], [250, 44]].map(([x, y], i) => (
        <g key={`sp${i}`} transform={`translate(${x},${y})`} fill={CREAM}>
          <animate attributeName="opacity" values="0;1;0" dur="2.4s" begin={`${i * 0.7}s`} repeatCount="indefinite" />
          <path d="M0,-5 L1,-1 L5,0 L1,1 L0,5 L-1,1 L-5,0 L-1,-1 Z" />
        </g>
      ))}
    </svg>
  );
}
