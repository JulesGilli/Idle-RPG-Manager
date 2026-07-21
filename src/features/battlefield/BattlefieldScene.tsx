/**
 * Décor d'en-tête des Champs de bataille : plaine de guerre 100 % SVG, dans la
 * teinte rouge de l'arc 2 (Terres du Désespoir). Ciel de cendres, deux lignes de
 * lances qui se font face, étendards qui claquent, corbeaux, fumées.
 *
 * Purement décoratif — aucun état de jeu. Le sujet est la BATAILLE RANGÉE :
 * deux masses qui s'affrontent, pas un duel. C'est ce qui distingue cette
 * activité du reste du jeu (10 contre 10 au lieu de 5).
 */

const EMBER = '#e0484d'; // accent d'arc 2
const RUST = '#8c3a2e';
const STEEL = '#c8ceda';
const STEEL_DARK = '#7d8593';
const BONE = '#d9cbb2';
const WOOD = '#5a3b26';

/** Hampes d'une ligne de lances : x + hauteur, pour varier la silhouette. */
const LEFT_SPEARS: [number, number][] = [
  [46, 58], [62, 70], [78, 52], [94, 66], [110, 46], [126, 62], [142, 54], [158, 68],
];
const RIGHT_SPEARS: [number, number][] = [
  [524, 60], [540, 50], [556, 68], [572, 54], [588, 64], [604, 48], [620, 58], [636, 66],
];

/** Une hampe inclinée avec sa pointe. `dir` = sens d'inclinaison. */
function Spear({ x, h, dir }: { x: number; h: number; dir: 1 | -1 }) {
  const top = 150 - h;
  const lean = 5 * dir;
  return (
    <g>
      <line
        x1={x}
        y1={152}
        x2={x + lean}
        y2={top}
        stroke={WOOD}
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      <path
        d={`M${x + lean} ${top} l${3.2 * dir} 5 l${-3.2 * dir} 5 l${-3.2 * dir} -5 z`}
        fill={STEEL}
        opacity={0.9}
      />
    </g>
  );
}

/** Étendard déchiré, qui ondule lentement. */
function Banner({ x, delay }: { x: number; delay: string }) {
  return (
    <g>
      <line x1={x} y1={152} x2={x} y2={64} stroke={WOOD} strokeWidth={3} strokeLinecap="round" />
      <path d={`M${x} 68 q22 6 34 -2 l0 26 q-12 8 -34 2 z`} fill={EMBER} opacity={0.85}>
        <animate
          attributeName="d"
          dur="3.4s"
          begin={delay}
          repeatCount="indefinite"
          values={`M${x} 68 q22 6 34 -2 l0 26 q-12 8 -34 2 z;
                   M${x} 68 q22 -4 34 4 l0 26 q-12 -2 -34 4 z;
                   M${x} 68 q22 6 34 -2 l0 26 q-12 8 -34 2 z`}
        />
      </path>
      {/* Déchirure : une entaille sombre qui donne l'air « après la bataille ». */}
      <path d={`M${x + 24} 74 l6 8 l-5 7`} fill="none" stroke="#2a1216" strokeWidth={1.6} opacity={0.7} />
    </g>
  );
}

/** Corbeau qui plane, décalé dans le temps pour éviter l'effet mécanique. */
function Crow({ x, y, delay, scale = 1 }: { x: number; y: number; delay: string; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} opacity={0.75}>
      <animateTransform
        attributeName="transform"
        type="translate"
        dur="9s"
        begin={delay}
        repeatCount="indefinite"
        additive="sum"
        values="0 0; 26 -6; 52 0"
      />
      <path d="M0 0 q6 -5 12 0 q-6 3 -12 0" fill="#1b1418">
        <animate
          attributeName="d"
          dur="0.9s"
          begin={delay}
          repeatCount="indefinite"
          values="M0 0 q6 -5 12 0 q-6 3 -12 0;
                  M0 0 q6 4 12 0 q-6 -2 -12 0;
                  M0 0 q6 -5 12 0 q-6 3 -12 0"
        />
      </path>
    </g>
  );
}

export function BattlefieldScene() {
  return (
    <svg
      viewBox="0 0 680 190"
      preserveAspectRatio="xMidYMid slice"
      className="block h-full w-full"
      role="img"
      aria-label="Champ de bataille au crépuscule : deux armées face à face"
    >
      <defs>
        <linearGradient id="bf-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a0f14" />
          <stop offset="55%" stopColor="#3b1a1c" />
          <stop offset="100%" stopColor="#6b2d24" />
        </linearGradient>
        <radialGradient id="bf-sun" cx="0.5" cy="1" r="0.75">
          <stop offset="0%" stopColor={EMBER} stopOpacity="0.55" />
          <stop offset="100%" stopColor={EMBER} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="bf-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4a2119" />
          <stop offset="100%" stopColor="#25100f" />
        </linearGradient>
        {/* Voile de fumée : deux nappes qui dérivent en sens inverse. */}
        <linearGradient id="bf-smoke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#000" stopOpacity="0" />
          <stop offset="50%" stopColor="#1a0f14" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect width="680" height="190" fill="url(#bf-sky)" />
      <ellipse cx="340" cy="152" rx="300" ry="90" fill="url(#bf-sun)" />

      {/* Crête lointaine : la ligne d'horizon d'un champ dévasté. */}
      <path
        d="M0 118 L70 104 L128 116 L196 98 L262 112 L340 96 L420 110 L486 100 L556 114 L624 102 L680 116 L680 190 L0 190 Z"
        fill="#2b1418"
        opacity={0.9}
      />

      {/* Corbeaux, avant les troupes pour rester en arrière-plan. */}
      <Crow x={120} y={44} delay="0s" />
      <Crow x={430} y={34} delay="2.6s" scale={0.85} />
      <Crow x={280} y={56} delay="5.1s" scale={0.7} />

      {/* Sol */}
      <path d="M0 148 Q340 132 680 148 L680 190 L0 190 Z" fill="url(#bf-ground)" />

      {/* Lignes de lances : gauche penchée à droite, droite penchée à gauche —
          c'est l'inclinaison opposée qui fait lire « deux camps ». */}
      {LEFT_SPEARS.map(([x, h]) => (
        <Spear key={`l${x}`} x={x} h={h} dir={1} />
      ))}
      {RIGHT_SPEARS.map(([x, h]) => (
        <Spear key={`r${x}`} x={x} h={h} dir={-1} />
      ))}

      <Banner x={92} delay="0s" />
      <Banner x={566} delay="1.7s" />

      {/* Boucliers plantés au sol, au centre : le no man's land. */}
      {[300, 340, 380].map((x, i) => (
        <g key={x} transform={`translate(${x} ${142 + (i % 2)})`}>
          <path
            d="M0 0 q10 -4 20 0 l0 14 q-10 10 -20 0 z"
            fill={i === 1 ? RUST : STEEL_DARK}
            opacity={0.85}
          />
          <line x1={10} y1={2} x2={10} y2={20} stroke={BONE} strokeWidth={1} opacity={0.35} />
        </g>
      ))}

      {/* Épées fichées en terre — les morts de la veille. */}
      {[236, 262, 424, 452].map((x, i) => (
        <g key={x} opacity={0.7}>
          <line
            x1={x}
            y1={150}
            x2={x + (i % 2 ? 3 : -3)}
            y2={128}
            stroke={STEEL_DARK}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
          <line x1={x - 4} y1={133} x2={x + 4} y2={133} stroke={STEEL_DARK} strokeWidth={1.6} />
        </g>
      ))}

      {/* Deux nappes de fumée qui traversent lentement, en sens opposés. */}
      <rect x="-680" y="96" width="680" height="46" fill="url(#bf-smoke)" opacity={0.6}>
        <animate attributeName="x" dur="26s" repeatCount="indefinite" values="-680;680" />
      </rect>
      <rect x="680" y="120" width="540" height="40" fill="url(#bf-smoke)" opacity={0.45}>
        <animate attributeName="x" dur="34s" repeatCount="indefinite" values="680;-540" />
      </rect>
    </svg>
  );
}
