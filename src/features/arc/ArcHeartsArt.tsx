/**
 * PHASE 2 du boss d'arc : LES CINQ CŒURS DE DÉMON.
 *
 * Prend la place de l'ange (`ArcBossArt`) au centre de l'arène quand l'Être est
 * à terre. La scène doit se lire en une seconde, à petite taille, sur un fond
 * sombre : une AURÉOLE BRISÉE en haut (le divin est tombé) et cinq cœurs
 * écarlates SUSPENDUS à leurs vaisseaux, qui battent.
 *
 * Ce qui a été volontairement RETIRÉ après l'avoir vu à l'écran : une dépouille
 * d'ange (ailes + torse) derrière les cœurs. À cette échelle les ailes
 * affaissées lisaient comme des pattes d'insecte et brouillaient tout. Une
 * auréole rompue raconte la même chute en une seule forme lisible.
 *
 * Les cœurs sont INCLINÉS d'angles différents et pendent chacun d'une veine :
 * alignés bien droits, ils lisaient comme des pictogrammes d'amour. L'inclinaison
 * et la suspension leur rendent leur poids d'organe arraché.
 *
 * Les cinq battent sur le MÊME tempo, décalés de 90 ms : l'œil perçoit une onde
 * qui traverse la rangée plutôt que cinq animations indépendantes.
 *
 * Tous les ids de `defs` sont préfixés `ah-` : ils vivent dans le même document
 * que ceux de l'arène (`ar-`) et de l'ange (`ab-`), une collision les écraserait.
 */

const CRIMSON_LT = '#e0344a';
const VEIN = '#28040b';
const HALO = '#9a8352';

/** Cadence du battement. Un cœur au repos, pas un stroboscope. */
const BEAT_DUR = '1.15s';

/**
 * Silhouette d'un cœur, centrée sur l'origine. Lobe GAUCHE plus haut et plus
 * gros que le droit, apex décalé : l'asymétrie est ce qui le sort du
 * pictogramme symétrique.
 */
const HEART_D =
  'M-2,27 C-16,17 -27,4 -26,-9 C-25,-21 -13,-26 -4,-19 ' +
  'C2,-26 15,-24 21,-15 C27,-5 23,9 12,18 C7,22 2,25 -2,27 Z';

/** Un cœur : suspendu à sa veine, hérissé, et battant. */
function Heart({
  x,
  y,
  sc,
  rot,
  delay,
}: {
  x: number;
  y: number;
  sc: number;
  rot: number;
  delay: string;
}) {
  return (
    <g transform={`translate(${x},${y})`}>
      {/* La veine qui le SUSPEND : elle monte hors du cadre. Dessinée avant le
          cœur pour passer derrière lui. */}
      <path
        d={`M0,-20 C${-4 * sc},-46 ${6 * sc},-70 ${2 * sc},-104`}
        stroke={VEIN}
        strokeWidth={3.2 * sc}
        fill="none"
        strokeLinecap="round"
        opacity="0.75"
      />

      <g transform={`scale(${sc}) rotate(${rot})`}>
        {/* Halo — il enfle avec le battement. */}
        <circle cx="0" cy="0" r="32" fill="url(#ah-aura)">
          <animate attributeName="r" values="28;37;29;28" dur={BEAT_DUR} begin={delay} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.5;0.92;0.55;0.5" dur={BEAT_DUR} begin={delay} repeatCount="indefinite" />
        </circle>

        {/* Ce groupe est ce qui BAT (systole brève, diastole lente). */}
        <g>
          <animateTransform
            attributeName="transform"
            type="scale"
            values="1;1.13;0.98;1.02;1"
            keyTimes="0;0.16;0.34;0.55;1"
            dur={BEAT_DUR}
            begin={delay}
            repeatCount="indefinite"
            additive="sum"
          />
          {/* Vaisseaux TRANCHÉS, épais et courts : arrachés, pas plantés. */}
          <g fill={VEIN}>
            <path d="M-7,-20 C-11,-30 -20,-32 -24,-27 C-27,-23 -24,-19 -21,-21 C-18,-24 -14,-23 -12,-17 Z" />
            <path d="M9,-21 C13,-30 21,-31 24,-26 C26,-22 23,-19 20,-21 C18,-24 15,-23 13,-17 Z" />
          </g>
          {/* Épines : la marque démoniaque, en débord de la chair. */}
          <g fill={VEIN}>
            <path d="M-26,-8 l-11,-4 l9,-2 Z" />
            <path d="M-23,6 l-11,4 l10,1 Z" />
            <path d="M22,-11 l11,-5 l-9,-2 Z" />
            <path d="M21,8 l11,5 l-10,1 Z" />
            <path d="M-2,28 l1,12 l5,-10 Z" />
          </g>
          <path d={HEART_D} fill="url(#ah-flesh)" stroke={VEIN} strokeWidth="1.6" />
          {/* Sillon coronaire + ramifications : le relief des ventricules. */}
          <g stroke={VEIN} strokeWidth="1.7" fill="none" opacity="0.85" strokeLinecap="round">
            <path d="M-17,-13 C-9,-6 -2,-2 6,-3 C14,-4 19,-9 21,-14" />
            <path d="M-2,-2 C-4,7 -7,15 -3,26" />
            <path d="M5,-3 C9,4 13,10 14,17" />
            <path d="M-15,2 C-11,8 -9,13 -9,18" />
          </g>
          {/* Lumière du sang : elle s'allume à la contraction. */}
          <ellipse cx="-3" cy="-6" rx="7" ry="9" fill={CRIMSON_LT} opacity="0.16" transform="rotate(-20)">
            <animate attributeName="opacity" values="0.1;0.44;0.13;0.1" dur={BEAT_DUR} begin={delay} repeatCount="indefinite" />
          </ellipse>
        </g>
      </g>
    </g>
  );
}

export function ArcHeartsArt() {
  /**
   * Disposition en arc, avec une inclinaison PROPRE à chaque cœur : cinq organes
   * pendus, pas une rangée de pictogrammes. Les cœurs du bord sont plus bas et
   * plus petits (profondeur).
   */
  const hearts = [
    { x: -132, y: 34, sc: 0.72, rot: -14 },
    { x: -68, y: 4, sc: 0.9, rot: 9 },
    { x: 2, y: -16, sc: 1.08, rot: -6 },
    { x: 72, y: 4, sc: 0.9, rot: 13 },
    { x: 136, y: 34, sc: 0.72, rot: -10 },
  ];

  return (
    <g transform="translate(340,120)">
      <defs>
        <radialGradient id="ah-aura" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor={CRIMSON_LT} stopOpacity="0.5" />
          <stop offset="45%" stopColor="#8c0f22" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#4d0713" stopOpacity="0" />
        </radialGradient>
        {/* Chair sombre : la lumière vient d'en haut à gauche, le bas reste noir. */}
        <radialGradient id="ah-flesh" cx="0.32" cy="0.24" r="0.88">
          <stop offset="0%" stopColor="#b81e33" />
          <stop offset="45%" stopColor="#7d0d1e" />
          <stop offset="100%" stopColor="#2e040c" />
        </radialGradient>
        <radialGradient id="ah-pool" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#8c0f22" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#4d0713" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* ------------------------------------------- l'auréole brisée ------- */}
      {/* Seul vestige de l'ange, et le plus lisible : un anneau d'or terni,
          rompu en deux arcs, avec ses éclats qui dérivent. */}
      <g opacity="0.6">
        <path d="M-74,-78 A76,20 0 0 1 34,-88" fill="none" stroke={HALO} strokeWidth="5" strokeLinecap="round" />
        <path d="M62,-80 A76,20 0 0 1 30,-62" fill="none" stroke={HALO} strokeWidth="5" strokeLinecap="round" opacity="0.8" />
        <path d="M44,-92 l9,4 l-8,4 Z" fill={HALO} opacity="0.85" />
        <path d="M-2,-98 l7,3 l-7,3 Z" fill={HALO} opacity="0.6" />
        <path d="M-46,-96 l7,3 l-8,3 Z" fill={HALO} opacity="0.45" />
      </g>

      {/* Flaque de lumière au sol : ancre les cœurs, sinon ils flottent. */}
      <ellipse cx="0" cy="96" rx="200" ry="30" fill="url(#ah-pool)" />

      {/* ------------------------------------------------- les cinq cœurs ---- */}
      {hearts.map((h, i) => (
        <Heart key={i} x={h.x} y={h.y} sc={h.sc} rot={h.rot} delay={`${i * 0.09}s`} />
      ))}

      {/* Braises ascendantes : le seul mouvement lent, il évite que tout batte
          au même rythme. */}
      {[-150, -76, 12, 86, 154].map((x, i) => (
        <circle key={x} cx={x} cy="80" r={1.8 - (i % 2) * 0.6} fill={CRIMSON_LT} opacity="0.7">
          <animate attributeName="cy" values="82;-56" dur={`${3.6 + i * 0.7}s`} begin={`${i * 0.8}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;0.75;0" dur={`${3.6 + i * 0.7}s`} begin={`${i * 0.8}s`} repeatCount="indefinite" />
        </circle>
      ))}
    </g>
  );
}
