/**
 * Décor d'en-tête de l'Autel des Runes : une scène arcanique 100 % SVG (pas d'image)
 * dans la DA du jeu — dais de pierre, rune maîtresse en lévitation qui pulse, runes
 * satellites en orbite, braseros violets, particules ascendantes. Purement décoratif.
 */

const ARC = '#c084fc'; // var(--color-arcane)
const ARC_SOFT = '#d8b4fe';
const ARC_DEEP = '#7c3aed';

/** Rune facettée (losange runique) : socle sombre liseré arcane + glyphe lumineux. */
function RuneGem({ size = 26, glyph = 'y' }: { size?: number; glyph?: string }) {
  const s = size;
  const glyphs: Record<string, string> = {
    y: `M0,${-s * 0.5} L0,${s * 0.4} M0,${-s * 0.1} L${-s * 0.28},${-s * 0.34} M0,${-s * 0.1} L${s * 0.28},${-s * 0.34}`,
    x: `M${-s * 0.3},${-s * 0.34} L${s * 0.3},${s * 0.28} M${s * 0.3},${-s * 0.34} L${-s * 0.3},${s * 0.28}`,
    k: `M${-s * 0.16},${-s * 0.5} L${-s * 0.16},${s * 0.4} M${-s * 0.16},0 L${s * 0.28},${-s * 0.4} M${-s * 0.16},0 L${s * 0.28},${s * 0.36}`,
  };
  return (
    <g>
      <polygon
        points={`0,${-s * 0.7} ${s * 0.6},0 0,${s * 0.7} ${-s * 0.6},0`}
        fill="#2a1c48"
        stroke={ARC}
        strokeWidth={s * 0.055}
      />
      <polygon points={`0,${-s * 0.7} ${s * 0.18},0 0,${s * 0.7} ${-s * 0.18},0`} fill={ARC_DEEP} opacity={0.5} />
      <path d={glyphs[glyph] ?? glyphs.y} stroke={ARC_SOFT} strokeWidth={s * 0.07} fill="none" strokeLinecap="round" filter="url(#al-glow)" />
    </g>
  );
}

export function AltarScene() {
  const cx = 340;
  const cy = 84;
  return (
    <svg viewBox="0 0 680 190" className="block h-auto w-full" role="img" aria-label="Autel des Runes">
      <defs>
        <linearGradient id="al-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#140f26" />
          <stop offset="100%" stopColor="#281a45" />
        </linearGradient>
        <radialGradient id="al-core" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor={ARC_SOFT} stopOpacity="0.55" />
          <stop offset="60%" stopColor={ARC} stopOpacity="0.18" />
          <stop offset="100%" stopColor={ARC} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="al-stone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3a2c58" />
          <stop offset="100%" stopColor="#1c1230" />
        </linearGradient>
        <filter id="al-glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="1.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="al-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>

      {/* Ciel arcanique */}
      <rect x="0" y="0" width="680" height="190" fill="url(#al-sky)" />

      {/* Étoiles */}
      {[[60, 30], [140, 20], [250, 40], [430, 26], [560, 34], [620, 18], [90, 60], [600, 66]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 2 ? 1.2 : 0.8} fill="#fff" opacity={0.35}>
          <animate attributeName="opacity" values="0.15;0.5;0.15" dur={`${3 + (i % 3)}s`} repeatCount="indefinite" />
        </circle>
      ))}

      {/* Halo central */}
      <ellipse cx={cx} cy={cy} rx="150" ry="120" fill="url(#al-core)" filter="url(#al-blur)" />

      {/* Rais de lumière tournants */}
      <g opacity={0.5}>
        <animateTransform attributeName="transform" type="rotate" values={`0 ${cx} ${cy};360 ${cx} ${cy}`} dur="60s" repeatCount="indefinite" />
        {[0, 60, 120, 180, 240, 300].map((a) => (
          <polygon key={a} points={`${cx},${cy} ${cx - 8},${cy + 150} ${cx + 8},${cy + 150}`} fill={ARC} opacity={0.05} transform={`rotate(${a} ${cx} ${cy})`} />
        ))}
      </g>

      {/* Braseros latéraux */}
      {[118, 562].map((px, i) => (
        <g key={i} transform={`translate(${px},0)`}>
          {/* colonne */}
          <rect x={-9} y={70} width={18} height={104} fill="url(#al-stone)" />
          <rect x={-13} y={66} width={26} height={7} rx={2} fill="#43335f" />
          <rect x={-14} y={168} width={28} height={8} rx={2} fill="#43335f" />
          <rect x={-6} y={78} width={2} height={90} fill="#000" opacity={0.2} />
          {/* vasque */}
          <path d="M-12,60 Q0,72 12,60 L9,66 L-9,66 Z" fill="#2a1c40" />
          {/* flamme arcane */}
          <path d="M0,58 Q-6,44 0,32 Q6,44 0,58 Z" fill={ARC} filter="url(#al-glow)">
            <animate attributeName="d" values="M0,58 Q-6,44 0,32 Q6,44 0,58 Z;M0,58 Q-5,42 1,30 Q6,45 0,58 Z;M0,58 Q-6,44 0,32 Q6,44 0,58 Z" dur="1.4s" repeatCount="indefinite" />
          </path>
          <path d="M0,56 Q-3,46 0,38 Q3,46 0,56 Z" fill={ARC_SOFT}>
            <animate attributeName="opacity" values="0.7;1;0.7" dur="1.1s" repeatCount="indefinite" />
          </path>
          {/* braises qui montent */}
          {[0, 1].map((k) => (
            <circle key={k} cx={0} cy={40} r={1.3} fill={ARC_SOFT}>
              <animate attributeName="cy" values="40;14" dur={`${2.2 + k}s`} begin={`${k * 0.7}s`} repeatCount="indefinite" />
              <animate attributeName="opacity" values="1;0" dur={`${2.2 + k}s`} begin={`${k * 0.7}s`} repeatCount="indefinite" />
            </circle>
          ))}
        </g>
      ))}

      {/* Dais en pierre (marches) */}
      <g>
        <polygon points={`${cx - 90},176 ${cx + 90},176 ${cx + 70},162 ${cx - 70},162`} fill="url(#al-stone)" />
        <polygon points={`${cx - 66},162 ${cx + 66},162 ${cx + 50},150 ${cx - 50},150`} fill="url(#al-stone)" />
        <polygon points={`${cx - 46},150 ${cx + 46},150 ${cx + 34},140 ${cx - 34},140`} fill="#43335f" />
        {/* cercle runique gravé sur le socle */}
        <ellipse cx={cx} cy={145} rx="30" ry="7" fill="none" stroke={ARC} strokeWidth="1" opacity="0.6">
          <animate attributeName="opacity" values="0.3;0.7;0.3" dur="3s" repeatCount="indefinite" />
        </ellipse>
      </g>

      {/* Runes satellites en orbite */}
      <g>
        <animateTransform attributeName="transform" type="rotate" values={`0 ${cx} ${cy};360 ${cx} ${cy}`} dur="18s" repeatCount="indefinite" />
        {[
          { a: 0, g: 'x' },
          { a: 120, g: 'k' },
          { a: 240, g: 'y' },
        ].map(({ a, g }) => {
          const rad = (a * Math.PI) / 180;
          const rx = cx + Math.cos(rad) * 74;
          const ry = cy + Math.sin(rad) * 26;
          // Contre-rotation pour garder les runes droites.
          return (
            <g key={a} transform={`translate(${rx},${ry})`}>
              <g transform={`rotate(${-a} 0 0)`} opacity={0.9}>
                <RuneGem size={12} glyph={g} />
              </g>
            </g>
          );
        })}
      </g>

      {/* Rune maîtresse en lévitation */}
      <g transform={`translate(${cx},${cy})`}>
        <animateTransform attributeName="transform" type="translate" values={`${cx} ${cy};${cx} ${cy - 6};${cx} ${cy}`} dur="3.6s" repeatCount="indefinite" />
        <circle r="30" fill={ARC} opacity="0.22" filter="url(#al-blur)">
          <animate attributeName="opacity" values="0.15;0.32;0.15" dur="2.6s" repeatCount="indefinite" />
        </circle>
        <g filter="url(#al-glow)">
          <RuneGem size={30} glyph="y" />
        </g>
        <circle r="2.4" fill="#fff" opacity="0.9">
          <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite" />
        </circle>
      </g>

      {/* Particules ascendantes */}
      {[200, 300, 380, 470, 260, 420].map((x, i) => (
        <circle key={i} cx={x} cy={150} r={i % 2 ? 1.4 : 1} fill={i % 3 === 0 ? '#fff' : ARC_SOFT} filter="url(#al-glow)">
          <animate attributeName="cy" values="150;40" dur={`${4 + (i % 3)}s`} begin={`${i * 0.6}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;0.9;0" dur={`${4 + (i % 3)}s`} begin={`${i * 0.6}s`} repeatCount="indefinite" />
        </circle>
      ))}
    </svg>
  );
}
