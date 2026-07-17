/**
 * Visuel dédié du BOSS DE LA SEMAINE : un colosse démoniaque ailé, dessiné à la main
 * (SVG), pensé pour être IMPOSANT. Symétrique (moitié droite dessinée puis miroir),
 * cœur incandescent + yeux pulsants, ailes membraneuses qui battent lentement, braises
 * qui montent. `accent` ne teinte QUE les lueurs (le corps reste sombre et dramatique).
 */

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}
function lighten(hex: string, f: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const m = (v: number) => clamp(v + (255 - v) * f);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}

export function WorldBossArt({ accent = '#f5b544', size = 210 }: { accent?: string; size?: number }) {
  const core = accent;
  const coreBright = lighten(accent, 0.55);
  const ember = '#ff7a2f';
  const eyeGlow = lighten(accent, 0.35);

  const BODY = '#241a1e';
  const BODY_DK = '#160f12';
  const BODY_LT = '#3a2a2e';
  const RIM = '#7a3f24';
  const WING = '#1c1319';
  const WING_RIB = '#3a2a30';
  const BONE = '#d6c7a6';
  const BONE_DK = '#8a7a5a';

  // Moitié DROITE (x > 130) : aile (battante), corne, épaule, bras. Rendue telle
  // quelle puis en miroir autour de x=130 → symétrie parfaite.
  const half = (
    <g>
      {/* aile membraneuse (bat lentement autour de l'épaule) */}
      <g>
        <animateTransform
          attributeName="transform"
          type="rotate"
          values="-4 150 98; 3 150 98; -4 150 98"
          dur="4.2s"
          repeatCount="indefinite"
        />
        <path
          d="M150,98 Q198,48 248,54 L230,76 Q246,84 238,100 L221,90 Q233,108 223,122 L208,110 Q216,130 205,143 L192,128 Q198,150 185,153 Q166,120 150,112 Z"
          fill={WING}
          stroke={WING_RIB}
          strokeWidth={1}
        />
        <g stroke={WING_RIB} strokeWidth={1.4} fill="none" strokeLinecap="round" opacity={0.9}>
          <path d="M152,102 L246,56" />
          <path d="M152,106 L237,80" />
          <path d="M153,110 L223,102" />
          <path d="M154,114 L205,124" />
        </g>
        {/* membrane teintée par la lueur du cœur (transparence chaude) */}
        <path
          d="M150,98 Q198,48 248,54 L230,76 Q246,84 238,100 L221,90 Q233,108 223,122 L208,110 Q216,130 205,143 L192,128 Q198,150 185,153 Q166,120 150,112 Z"
          fill={ember}
          opacity={0.05}
        />
      </g>

      {/* corne recourbée */}
      <path d="M141,72 Q156,44 180,32 Q196,26 205,20 Q190,40 182,58 Q172,70 152,78 Z" fill={BONE} />
      <path d="M143,72 Q158,48 180,36 Q168,52 160,66 Q153,72 146,74 Z" fill={BONE_DK} opacity={0.55} />

      {/* pointe d'épaule osseuse */}
      <path d="M150,100 L172,84 L168,102 Z" fill={BODY_LT} />
      <path d="M150,100 L172,84 L168,94 Z" fill={RIM} opacity={0.5} />

      {/* bras massif + serres */}
      <path
        d="M154,104 Q184,110 186,138 Q189,166 175,186 Q168,197 159,200 L152,190 Q166,176 168,152 Q166,128 148,116 Z"
        fill={BODY}
      />
      <path d="M156,110 Q178,118 180,140 Q182,160 172,178" fill="none" stroke={RIM} strokeWidth={2} opacity={0.5} />
      {/* serres */}
      <g fill={BONE}>
        <path d="M159,198 l3,15 l-4,-3 l-1,4 l-3,-6 Z" />
        <path d="M167,196 l5,14 l-5,-2 l-1,4 l-2,-7 Z" />
        <path d="M174,190 l7,11 l-6,-1 l-1,4 l-3,-6 Z" />
      </g>
    </g>
  );

  return (
    <svg viewBox="0 0 260 250" width={size} height={size} role="img" aria-label="Boss de la semaine">
      <defs>
        <filter id="wb-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="wb-aura" cx="50%" cy="42%" r="55%">
          <stop offset="0%" stopColor={core} stopOpacity="0.42" />
          <stop offset="55%" stopColor={ember} stopOpacity="0.12" />
          <stop offset="100%" stopColor={core} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="wb-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={coreBright} />
          <stop offset="55%" stopColor={core} />
          <stop offset="100%" stopColor={ember} />
        </radialGradient>
      </defs>

      {/* aura arrière */}
      <rect x="0" y="0" width="260" height="250" fill="url(#wb-aura)" />
      {/* halo au sol */}
      <ellipse cx="130" cy="226" rx="78" ry="13" fill={core} opacity={0.28} filter="url(#wb-glow)" />

      {/* Le colosse respire (léger flottement d'ensemble) */}
      <g>
        <animateTransform attributeName="transform" type="translate" values="0 0; 0 -3.5; 0 0" dur="3.6s" repeatCount="indefinite" />

        {/* AILES + membres, en dessous du corps */}
        {half}
        <g transform="translate(260,0) scale(-1,1)">{half}</g>

        {/* base : le bas du corps se fond en fumée/rocaille */}
        <path d="M104,196 Q86,220 62,224 Q98,230 130,228 Q162,230 198,224 Q174,220 156,196 Q150,214 130,216 Q110,214 104,196 Z" fill={BODY_DK} />

        {/* CORPS central (liseré chaud pour détacher la silhouette du fond sombre) */}
        <path
          d="M96,104 Q130,90 164,104 Q174,150 156,198 Q150,216 130,218 Q110,216 104,198 Q86,150 96,104 Z"
          fill={BODY}
          stroke={RIM}
          strokeWidth={1.6}
          strokeOpacity={0.55}
        />
        {/* volume/ombrage */}
        <path d="M130,92 Q130,150 130,218 Q112,214 106,196 Q88,150 98,106 Q114,96 130,92 Z" fill={BODY_DK} opacity={0.45} />
        {/* plastron plus clair */}
        <path d="M112,120 Q130,112 148,120 Q156,158 146,194 Q130,206 114,194 Q104,158 112,120 Z" fill={BODY_LT} opacity={0.5} />
        {/* pectoraux / abdos suggérés */}
        <g stroke={BODY_DK} strokeWidth={1.4} fill="none" opacity={0.6}>
          <path d="M118,132 Q130,138 142,132" />
          <path d="M120,150 L140,150 M122,162 L138,162 M124,174 L136,174" />
        </g>

        {/* CŒUR incandescent (fêlures + orbe pulsant) */}
        <g filter="url(#wb-glow)">
          <g stroke={ember} strokeWidth={2} strokeLinecap="round" opacity={0.85}>
            <path d="M130,134 L127,150 L130,166" />
            <path d="M130,150 L117,145 M130,150 L143,145 M130,150 L121,163 M130,150 L139,163" />
          </g>
          <circle cx="130" cy="150" r="8" fill="url(#wb-core)">
            <animate attributeName="r" values="7;9;7" dur="1.8s" repeatCount="indefinite" />
          </circle>
          <circle cx="130" cy="150" r="3.4" fill="#fff" opacity={0.9}>
            <animate attributeName="opacity" values="0.6;1;0.6" dur="1.8s" repeatCount="indefinite" />
          </circle>
        </g>

        {/* TÊTE : crâne démoniaque cornu, regard incandescent, gueule à crocs */}
        <g>
          {/* crête centrale entre les cornes */}
          <path d="M130,66 l-4,-14 l4,5 l4,-5 Z" fill={BONE} />
          {/* tête */}
          <path d="M116,74 Q130,64 144,74 Q149,88 140,100 Q130,108 120,100 Q111,88 116,74 Z" fill={BODY} />
          <path d="M116,74 Q130,64 144,74 Q146,80 143,86 Q130,78 117,86 Q114,80 116,74 Z" fill={BODY_DK} opacity={0.5} />
          {/* arcade */}
          <path d="M118,82 Q130,75 142,82" fill="none" stroke={BODY_DK} strokeWidth={2} />
          {/* yeux fendus incandescents */}
          <g filter="url(#wb-glow)">
            <path d="M120,86 l7,-2 l1.5,4 l-7,1.5 Z" fill={eyeGlow}>
              <animate attributeName="opacity" values="0.7;1;0.7" dur="2.2s" repeatCount="indefinite" />
            </path>
            <path d="M140,86 l-7,-2 l-1.5,4 l7,1.5 Z" fill={eyeGlow}>
              <animate attributeName="opacity" values="0.7;1;0.7" dur="2.2s" repeatCount="indefinite" />
            </path>
          </g>
          {/* gueule + crocs */}
          <path d="M122,96 Q130,103 138,96 L136,101 L134,97 L131,102 L128,97 L126,101 Z" fill={BODY_DK} />
          <g fill={BONE}>
            <path d="M124,97 l1.5,5 l1.5,-5 Z" />
            <path d="M135,97 l-1.5,5 l-1.5,-5 Z" />
          </g>
        </g>
      </g>

      {/* braises qui montent */}
      <g fill={core} filter="url(#wb-glow)">
        <circle cx="96" cy="180" r="1.6">
          <animate attributeName="cy" values="196;120;196" dur="3.4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;0.9;0" dur="3.4s" repeatCount="indefinite" />
        </circle>
        <circle cx="168" cy="170" r="1.3">
          <animate attributeName="cy" values="200;110;200" dur="4.1s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;0.8;0" dur="4.1s" repeatCount="indefinite" />
        </circle>
        <circle cx="130" cy="150" r="1.1">
          <animate attributeName="cy" values="190;96;190" dur="3.8s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;1;0" dur="3.8s" repeatCount="indefinite" />
        </circle>
        <circle cx="150" cy="185" r="1.2">
          <animate attributeName="cy" values="205;130;205" dur="4.6s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;0.7;0" dur="4.6s" repeatCount="indefinite" />
        </circle>
      </g>
    </svg>
  );
}
