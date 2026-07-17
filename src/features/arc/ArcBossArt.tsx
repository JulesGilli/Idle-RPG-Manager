/**
 * Visuel dédié du BOSS D'ARC : un ANGE BIBLIQUE (Trône / Séraphin) — être divin,
 * pâle et lumineux, couvert d'YEUX (grand œil central, bandeau et colonne d'yeux,
 * yeux sur les ailes) et d'une TONNE d'AILES emplumées déployées en éventail. Halo
 * doré, rayons de lumière, pupilles qui scrutent à l'unisson, léger flottement.
 * Conçu pour flotter au centre de l'arène (`ArcArena`) sur son fond sombre.
 */

const IVORY = '#f4f1ea';
const IVORY_SH = '#d6cdb9';
const IVORY_DK = '#b3a88f';
const GOLD = '#c79a54';
const IRIS = '#8fc2d4';
const IRIS_DK = '#4f8ea3';
const PUPIL = '#151a20';
const GLOW = '#fff6d8';

/** Aile emplumée pointant vers la DROITE depuis l'origine (bord inférieur festonné). */
const WING_D =
  'M0,0 Q58,-30 130,-20 Q120,-9 129,1 Q112,-4 119,9 Q102,3 108,17 Q90,10 93,24 ' +
  'Q74,16 74,30 Q52,22 34,24 Q14,20 0,14 Z';

function Wing({ rot = 0, sc = 1, tone = IVORY, op = 1 }: { rot?: number; sc?: number; tone?: string; op?: number }) {
  return (
    <g transform={`rotate(${rot}) scale(${sc})`} opacity={op}>
      <path d={WING_D} fill={IVORY_DK} opacity={0.35} transform="translate(2.5,4)" />
      <path d={WING_D} fill={tone} stroke={IVORY_SH} strokeWidth={1} />
      <g stroke={IVORY_SH} strokeWidth={0.9} fill="none" opacity={0.7}>
        <path d="M10,1 Q64,-8 122,2" />
        <path d="M12,7 Q60,0 108,13" />
        <path d="M16,13 Q52,10 86,21" />
      </g>
      <g stroke={GOLD} strokeWidth={0.8} fill="none" opacity={0.45}>
        <path d="M126,0 l6,-2 M116,10 l6,-1 M104,18 l5,0" />
      </g>
    </g>
  );
}

/** Œil (amande) teinté divin, pupille qui scrute (animation partagée = regard à l'unisson). */
function Eye({ cx, cy, rx = 13, ry = 10, rot = 0, look = true }: { cx: number; cy: number; rx?: number; ry?: number; rot?: number; look?: boolean }) {
  return (
    <g transform={`translate(${cx},${cy}) rotate(${rot})`}>
      <path d={`M${-rx - 2},0 Q0,${-ry - 2} ${rx + 2},0 Q0,${ry + 2} ${-rx - 2},0 Z`} fill="none" stroke={GOLD} strokeWidth={1.3} opacity={0.85} />
      <path d={`M${-rx},0 Q0,${-ry} ${rx},0 Q0,${ry} ${-rx},0 Z`} fill={IVORY} />
      <circle r={ry * 0.92} fill={IRIS} />
      <circle r={ry * 0.92} fill="none" stroke={IRIS_DK} strokeWidth={1} />
      <circle r={ry * 0.44} fill={PUPIL}>
        {look && (
          <animateTransform attributeName="transform" type="translate" values="-2.2 0.4; 2.2 -0.6; 0.4 1; -2.2 0.4" dur="5.2s" repeatCount="indefinite" />
        )}
      </circle>
      <circle cx={-ry * 0.34} cy={-ry * 0.34} r={ry * 0.17} fill="#fff" />
      <path d={`M${-rx},0 Q0,${-ry} ${rx},0`} fill="none" stroke={GLOW} strokeWidth={0.9} opacity={0.55} />
    </g>
  );
}

export function ArcBossArt() {
  // Ailes de la moitié DROITE (deux tiers : arrière large + avant plus blanc), rendues
  // telles quelles puis en miroir → éventail symétrique.
  const wingsHalf = (
    <g>
      {/* tier arrière (grand, plus gris) */}
      <Wing rot={-74} sc={1.06} tone={IVORY_SH} op={0.9} />
      <Wing rot={-48} sc={1.12} tone={IVORY_SH} op={0.95} />
      <Wing rot={-22} sc={1.15} tone="#efe9dc" />
      <Wing rot={6} sc={1.1} tone={IVORY_SH} op={0.95} />
      <Wing rot={34} sc={1.0} tone={IVORY_SH} op={0.9} />
      <Wing rot={60} sc={0.86} tone={IVORY_DK} op={0.8} />
      {/* tier avant (plus petit, plus blanc) */}
      <Wing rot={-58} sc={0.8} tone={IVORY} />
      <Wing rot={-32} sc={0.86} tone={IVORY} />
      <Wing rot={-6} sc={0.9} tone={IVORY} />
      <Wing rot={22} sc={0.82} tone={IVORY} />
      <Wing rot={48} sc={0.72} tone={IVORY} />
    </g>
  );

  return (
    <g transform="translate(340,124)">
      <defs>
        <radialGradient id="ab-holy" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#fff7e6" stopOpacity="0.6" />
          <stop offset="45%" stopColor={GOLD} stopOpacity="0.18" />
          <stop offset="100%" stopColor={GOLD} stopOpacity="0" />
        </radialGradient>
        <filter id="ab-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* aura sacrée + rayons + anneau tournant */}
      <ellipse cx="0" cy="8" rx="180" ry="120" fill="url(#ab-holy)">
        <animate attributeName="opacity" values="0.7;1;0.7" dur="3.4s" repeatCount="indefinite" />
      </ellipse>
      <g opacity="0.4">
        <animateTransform attributeName="transform" type="rotate" values="0 0 0; 360 0 0" dur="60s" repeatCount="indefinite" />
        <g stroke={GOLD} strokeWidth="1" opacity="0.5">
          {[0, 30, 60, 90, 120, 150].map((a) => (
            <line key={a} x1="0" y1="-96" x2="0" y2="-118" stroke={GOLD} transform={`rotate(${a})`} />
          ))}
        </g>
        <circle r="100" fill="none" stroke={GOLD} strokeWidth="1.2" opacity="0.35" />
      </g>

      {/* léger flottement d'ensemble */}
      <g>
        <animateTransform attributeName="transform" type="translate" values="0 0; 0 -4; 0 0" dur="5s" repeatCount="indefinite" />

        {/* AILES en éventail (derrière) */}
        {wingsHalf}
        <g transform="scale(-1,1)">{wingsHalf}</g>

        {/* corps lumineux central (fuseau) */}
        <path d="M-14,-30 Q0,-40 14,-30 Q20,10 10,70 Q0,86 -10,70 Q-20,10 -14,-30 Z" fill={IVORY} stroke={IVORY_SH} strokeWidth="1" />
        <path d="M-14,-30 Q0,-40 14,-30 Q18,0 12,40 Q0,50 -12,40 Q-18,0 -14,-30 Z" fill="#fbf8f0" opacity="0.6" />
        {/* voile/plumes sur le bas du corps (comme la réf) */}
        <g stroke={IVORY_SH} strokeWidth="0.8" fill="none" opacity="0.6">
          <path d="M-8,44 L-11,74 M0,48 L0,80 M8,44 L11,74 M-4,46 L-5,78 M4,46 L5,78" />
        </g>

        {/* YEUX partout */}
        {/* colonne verticale au-dessus (crown d'yeux) */}
        <Eye cx={0} cy={-58} rx={7} ry={11} />
        <Eye cx={0} cy={-40} rx={9} ry={13} />
        {/* grand œil central */}
        <g filter="url(#ab-glow)">
          <Eye cx={0} cy={-4} rx={26} ry={19} />
        </g>
        {/* bandeau horizontal d'yeux (décroissants vers l'extérieur) */}
        <Eye cx={40} cy={-2} rx={13} ry={10} rot={-6} />
        <Eye cx={-40} cy={-2} rx={13} ry={10} rot={6} />
        <Eye cx={74} cy={4} rx={11} ry={8} rot={-12} />
        <Eye cx={-74} cy={4} rx={11} ry={8} rot={12} />
        <Eye cx={106} cy={12} rx={8} ry={6} rot={-18} />
        <Eye cx={-106} cy={12} rx={8} ry={6} rot={18} />
        {/* yeux sur les ailes / dispersés */}
        <Eye cx={150} cy={-14} rx={7} ry={5} rot={-24} />
        <Eye cx={-150} cy={-14} rx={7} ry={5} rot={24} />
        <Eye cx={58} cy={-40} rx={7} ry={9} rot={-8} />
        <Eye cx={-58} cy={-40} rx={7} ry={9} rot={8} />
        <Eye cx={30} cy={34} rx={7} ry={6} />
        <Eye cx={-30} cy={34} rx={7} ry={6} />
        <Eye cx={0} cy={44} rx={8} ry={7} />
      </g>
    </g>
  );
}
