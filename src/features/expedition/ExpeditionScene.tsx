/**
 * Décor d'en-tête de la Table des Expéditions : vista d'aventure au crépuscule,
 * 100 % SVG dans la DA du jeu — ciel dégradé + soleil bas qui pulse, chaînes de
 * montagnes en parallaxe, route qui serpente vers l'horizon avec un tracé de carte
 * qui « avance », une caravane en marche, une boussole dont l'aiguille tourne, des
 * oiseaux qui planent et de la poussière qui monte. Purement décoratif.
 */

const GOLD = '#f5b544';
const HOT = '#ffd27a';
const ARC = '#7c6cff';
const SAND = '#caa96e';
const SAND_HI = '#efd9a6';

export function ExpeditionScene() {
  return (
    <svg viewBox="0 0 680 190" className="block h-auto w-full" role="img" aria-label="Expéditions">
      <defs>
        <linearGradient id="xp-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#161327" />
          <stop offset="55%" stopColor="#2c2340" />
          <stop offset="100%" stopColor="#4a2f3f" />
        </linearGradient>
        <radialGradient id="xp-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#fff2cf" />
          <stop offset="45%" stopColor={HOT} />
          <stop offset="100%" stopColor="#c9603a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="xp-road" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={SAND} stopOpacity="0.15" />
          <stop offset="100%" stopColor={SAND} stopOpacity="0.85" />
        </linearGradient>
        <filter id="xp-glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="1.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="xp-soft" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>

      {/* Ciel */}
      <rect x="0" y="0" width="680" height="190" fill="url(#xp-sky)" />

      {/* Étoiles (haut du ciel) */}
      {[40, 110, 175, 250, 95, 300, 210, 150].map((x, i) => (
        <circle key={i} cx={x} cy={16 + (i % 4) * 9} r={i % 2 ? 1.2 : 0.8} fill="#fff" opacity={0.35}>
          <animate attributeName="opacity" values="0.15;0.6;0.15" dur={`${3 + (i % 3)}s`} begin={`${i * 0.4}s`} repeatCount="indefinite" />
        </circle>
      ))}

      {/* Soleil bas + halo */}
      <circle cx="516" cy="118" r="90" fill="url(#xp-sun)" filter="url(#xp-soft)" opacity="0.9">
        <animate attributeName="opacity" values="0.75;0.95;0.75" dur="6s" repeatCount="indefinite" />
      </circle>
      <circle cx="516" cy="118" r="26" fill={HOT} opacity="0.9" filter="url(#xp-glow)" />

      {/* Oiseaux qui planent */}
      {[
        { y: 46, dur: 15, begin: 0 },
        { y: 62, dur: 19, begin: 4 },
        { y: 38, dur: 22, begin: 9 },
      ].map((b, i) => (
        <g key={i} fill="none" stroke="#0d0b16" strokeWidth="1.6" strokeLinecap="round" opacity="0.55">
          <animateTransform attributeName="transform" type="translate" from={`-40 ${b.y}`} to={`720 ${b.y - 10}`} dur={`${b.dur}s`} begin={`${b.begin}s`} repeatCount="indefinite" />
          <path d="M0,0 Q4,-4 8,0 Q12,-4 16,0">
            <animate attributeName="d" values="M0,0 Q4,-4 8,0 Q12,-4 16,0;M0,1 Q4,-2 8,1 Q12,-2 16,1;M0,0 Q4,-4 8,0 Q12,-4 16,0" dur="0.5s" repeatCount="indefinite" />
          </path>
        </g>
      ))}

      {/* Montagnes lointaines (indigo) */}
      <path d="M0,128 L70,86 L120,110 L180,72 L245,112 L300,90 L360,120 L430,80 L500,116 L560,96 L620,120 L680,100 L680,190 L0,190 Z" fill="#2a2547" opacity="0.9" />
      {/* neige/lueur sur les crêtes */}
      <path d="M180,72 L196,84 L164,84 Z M430,80 L446,92 L414,92 Z" fill={ARC} opacity="0.35" />

      {/* Collines mid (teintées) */}
      <path d="M0,140 Q120,116 240,138 Q360,158 480,132 Q580,112 680,136 L680,190 L0,190 Z" fill="#33283f" />
      <path d="M0,150 Q160,132 320,150 Q480,166 680,146 L680,190 L0,190 Z" fill="#241b2e" />

      {/* Sol / plaine */}
      <rect x="0" y="150" width="680" height="40" fill="#191320" />

      {/* Route qui serpente vers l'horizon (tapering) */}
      <path d="M96,190 L168,190 L300,150 L322,150 L214,190 Z" fill="url(#xp-road)" />
      {/* tracé de carte « qui avance » le long de la route */}
      <path d="M150,188 L308,151" fill="none" stroke={SAND_HI} strokeWidth="2.4" strokeLinecap="round" strokeDasharray="2 12" opacity="0.9">
        <animate attributeName="stroke-dashoffset" values="0;-56" dur="1.4s" repeatCount="indefinite" />
      </path>

      {/* Panneau indicateur (bas gauche) */}
      <g transform="translate(70,150)">
        <rect x="-1.5" y="0" width="3" height="40" fill="#4a3524" />
        <g>
          <animateTransform attributeName="transform" type="rotate" values="-3 0 6;3 0 6;-3 0 6" dur="4s" repeatCount="indefinite" />
          <path d="M2,4 L34,4 L40,11 L34,18 L2,18 Z" fill={SAND} />
          <path d="M2,4 L34,4 L40,11 L34,18 L2,18 Z" fill="none" stroke="#7d5a34" strokeWidth="1" />
          <line x1="8" y1="11" x2="30" y2="11" stroke="#7d5a34" strokeWidth="1.4" strokeLinecap="round" />
        </g>
      </g>

      {/* Caravane en marche (silhouettes + monture bâtée) */}
      <g transform="translate(196,176)">
        <animateTransform attributeName="transform" type="translate" values="196 176;196 174;196 176" dur="0.8s" repeatCount="indefinite" additive="sum" />
        {/* monture bâtée */}
        <g transform="translate(-2,0)">
          <ellipse cx="0" cy="10" rx="14" ry="3" fill="#000" opacity="0.3" />
          <path d="M-12,4 Q-12,-2 -6,-2 L8,-2 Q13,-2 13,3 L13,6 L-12,6 Z" fill="#1c1520" />
          <rect x="-9" y="-8" width="12" height="7" rx="1.5" fill="#3a2c40" />
          <line x1="-12" y1="6" x2="-13" y2="12" stroke="#1c1520" strokeWidth="2" />
          <line x1="10" y1="6" x2="11" y2="12" stroke="#1c1520" strokeWidth="2" />
        </g>
        {/* marcheurs */}
        {[16, 30, 42].map((dx, i) => (
          <g key={i} transform={`translate(${dx},2)`}>
            <animateTransform attributeName="transform" type="translate" values={`${dx} 2;${dx} 0.5;${dx} 2`} dur="0.8s" begin={`${i * 0.16}s`} repeatCount="indefinite" additive="sum" />
            <circle cx="0" cy="-10" r="2.4" fill="#0d0a12" />
            <rect x="-1.6" y="-8" width="3.2" height="8" rx="1.4" fill="#0d0a12" />
            {i === 0 && <line x1="2" y1="-12" x2="2" y2="-20" stroke="#4a3524" strokeWidth="1.4" />}
          </g>
        ))}
      </g>

      {/* Destination à l'horizon : tente + fanion */}
      <g transform="translate(320,138)">
        <ellipse cx="0" cy="12" rx="14" ry="2.5" fill="#000" opacity="0.3" />
        <path d="M-11,12 L0,-4 L11,12 Z" fill="#2b3a52" />
        <path d="M0,-4 L11,12 L4,12 Z" fill="#20304a" />
        <path d="M-3,12 L-3,4 L3,4 L3,12 Z" fill="#0e1622" />
        <line x1="0" y1="-4" x2="0" y2="-16" stroke="#7d5a34" strokeWidth="1.4" />
        <path d="M0,-16 L11,-13 L0,-9 Z" fill={GOLD}>
          <animate attributeName="d" values="M0,-16 L11,-13 L0,-9 Z;M0,-16 L9,-12 L0,-9 Z;M0,-16 L11,-13 L0,-9 Z" dur="1.6s" repeatCount="indefinite" />
        </path>
      </g>

      {/* Poussière qui monte de la route */}
      {[150, 200, 250, 180, 230].map((x, i) => (
        <circle key={i} cx={x} cy={182} r={i % 2 ? 1.4 : 1} fill={SAND_HI} opacity="0" filter="url(#xp-glow)">
          <animate attributeName="cy" values="182;150" dur={`${5 + (i % 3)}s`} begin={`${i * 0.9}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;0.5;0" dur={`${5 + (i % 3)}s`} begin={`${i * 0.9}s`} repeatCount="indefinite" />
        </circle>
      ))}

      {/* Boussole (haut gauche) */}
      <g transform="translate(60,52)">
        <circle r="26" fill="#0e0b18" opacity="0.7" />
        <circle r="26" fill="none" stroke={GOLD} strokeWidth="1.6" opacity="0.85" />
        <circle r="21" fill="none" stroke={GOLD} strokeWidth="0.6" opacity="0.4" />
        {/* graduations N/E/S/O */}
        {[0, 90, 180, 270].map((a) => (
          <line key={a} x1="0" y1="-26" x2="0" y2="-21" stroke={HOT} strokeWidth="1.6" transform={`rotate(${a})`} />
        ))}
        {/* aiguille qui tourne lentement en cherchant le cap */}
        <g>
          <animateTransform attributeName="transform" type="rotate" values="-28;22;-10;35;-28" dur="9s" repeatCount="indefinite" />
          <polygon points="0,-18 4,0 0,4 -4,0" fill={GOLD} filter="url(#xp-glow)" />
          <polygon points="0,18 4,0 0,-4 -4,0" fill="#5a4a66" />
          <circle r="2.2" fill={HOT} />
        </g>
      </g>
    </svg>
  );
}
