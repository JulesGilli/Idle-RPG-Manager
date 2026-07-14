/**
 * Avatars de combattants 100 % SVG, reconnaissables par CLASSE (silhouette + arme
 * + coiffe distinctives, teintés par la couleur de classe). Dessinés autour de
 * l'ORIGINE = point au sol (pieds), l'axe Y monte vers le négatif. Retournent un
 * <g> → embarquables dans n'importe quel <svg> parent (scène de farm OU arène de
 * combat). Le sens (gauche/droite) et les animations d'attaque sont pilotés par le
 * parent via un transform ; le sprite ne gère que sa respiration (idle) et sa mort.
 */
import { classMeta } from '@/lib/gameUi';

/* --------------------------------------------------------------- couleurs -- */

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}
function mix(hex: string, target: number, f: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const m = (v: number) => clamp(v + (target - v) * f);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}
const darken = (hex: string, f: number) => mix(hex, 0, f);
const lighten = (hex: string, f: number) => mix(hex, 255, f);

const STEEL = '#c8ceda';
const STEEL_DARK = '#8b93a2';
const WOOD = '#7a5230';
const SKIN = '#e8c9a8';

/* --------------------------------------------------------------- archétypes -- */

export type FighterKind = 'melee' | 'ranged' | 'caster';

type Body = 'tunic' | 'robe' | 'armor';
type Head = 'helm' | 'crest' | 'closed' | 'hood' | 'hat' | 'halo';
type Weapon = 'sword' | 'flamesword' | 'dagger' | 'bow' | 'staff' | 'sceptre' | 'book';
type Arch = { body: Body; head: Head; weapon: Weapon; kind: FighterKind; shield?: boolean; cape?: boolean };

const ARCH: Record<string, Arch> = {
  guerrier: { body: 'tunic', head: 'helm', weapon: 'sword', kind: 'melee' },
  paladin: { body: 'armor', head: 'crest', weapon: 'sword', kind: 'melee', shield: true, cape: true },
  inquisiteur: { body: 'armor', head: 'closed', weapon: 'flamesword', kind: 'melee', cape: true },
  voleur: { body: 'tunic', head: 'hood', weapon: 'dagger', kind: 'melee' },
  archer: { body: 'tunic', head: 'hood', weapon: 'bow', kind: 'ranged' },
  mage: { body: 'robe', head: 'hat', weapon: 'staff', kind: 'caster' },
  soigneur: { body: 'robe', head: 'halo', weapon: 'sceptre', kind: 'caster' },
  necromancien: { body: 'robe', head: 'hood', weapon: 'book', kind: 'caster' },
};

const DEFAULT_ARCH: Arch = { body: 'tunic', head: 'helm', weapon: 'sword', kind: 'melee' };

export function archOf(classId: string): Arch {
  return ARCH[classId] ?? DEFAULT_ARCH;
}
export function fighterKind(classId: string): FighterKind {
  return archOf(classId).kind;
}

/* ------------------------------------------------------------ pièces du corps -- */

function Legs({ accent, body }: { accent: string; body: Body }) {
  if (body === 'robe') return null; // la robe couvre les jambes
  const c = darken(accent, 0.45);
  return (
    <g fill={c}>
      <rect x={-4.2} y={-9} width={3.4} height={9} rx={1.2} />
      <rect x={1} y={-9} width={3.4} height={9} rx={1.2} />
      <rect x={-4.6} y={-1.4} width={4.2} height={2.2} rx={1} fill={darken(accent, 0.6)} />
      <rect x={0.6} y={-1.4} width={4.2} height={2.2} rx={1} fill={darken(accent, 0.6)} />
    </g>
  );
}

function Torso({ accent, body }: { accent: string; body: Body }) {
  const main = accent;
  const dark = darken(accent, 0.3);
  if (body === 'robe') {
    return (
      <g>
        {/* jupe de robe évasée jusqu'au sol */}
        <path d={`M-5,-21 L5,-21 L10,0 L-10,0 Z`} fill={main} />
        <path d={`M0,-21 L5,-21 L10,0 L0,0 Z`} fill={dark} opacity={0.5} />
        {/* buste */}
        <path d="M-5,-21 Q0,-24 5,-21 L4,-13 L-4,-13 Z" fill={lighten(accent, 0.12)} />
        {/* ceinture nouée */}
        <rect x={-5} y={-15} width={10} height={2.4} rx={1} fill={darken(accent, 0.5)} />
      </g>
    );
  }
  if (body === 'armor') {
    return (
      <g>
        {/* plastron */}
        <path d="M-5.5,-20 Q0,-23 5.5,-20 L5,-9 L-5,-9 Z" fill={main} />
        <path d="M-5.5,-20 Q0,-23 5.5,-20 L5,-16 L-5,-16 Z" fill={lighten(accent, 0.18)} />
        {/* pauldrons */}
        <ellipse cx={-5.5} cy={-19} rx={3.2} ry={2.4} fill={lighten(accent, 0.1)} />
        <ellipse cx={5.5} cy={-19} rx={3.2} ry={2.4} fill={lighten(accent, 0.1)} />
        {/* bandes */}
        <rect x={-5} y={-13} width={10} height={1.4} fill={darken(accent, 0.45)} />
        <path d="M0,-20 L0,-9" stroke={darken(accent, 0.4)} strokeWidth={0.8} />
      </g>
    );
  }
  // tunic
  return (
    <g>
      <path d="M-4.6,-20 Q0,-22 4.6,-20 L4.2,-9 L-4.2,-9 Z" fill={main} />
      <path d="M-4.6,-20 Q0,-22 4.6,-20 L4.4,-16 L-4.4,-16 Z" fill={lighten(accent, 0.14)} />
      {/* ceinture */}
      <rect x={-4.4} y={-12} width={8.8} height={1.8} rx={0.8} fill={darken(accent, 0.5)} />
      <rect x={-1} y={-12} width={2} height={1.8} fill={lighten(accent, 0.2)} />
    </g>
  );
}

function Cape({ accent }: { accent: string }) {
  const c = darken(accent, 0.2);
  return (
    <path d="M-5,-20 Q-11,-10 -8,0 L-3,-2 Q-4,-12 -1,-20 Z" fill={c} opacity={0.9}>
      <animateTransform
        attributeName="transform"
        type="rotate"
        values="-2 -4 -20;2 -4 -20;-2 -4 -20"
        dur="3.2s"
        repeatCount="indefinite"
      />
    </path>
  );
}

function Head({ accent, head }: { accent: string; head: Head }) {
  const cy = -25;
  const hood = darken(accent, 0.25);
  switch (head) {
    case 'helm':
      return (
        <g>
          <circle cx={0} cy={cy} r={4} fill={SKIN} />
          <path d={`M-4.2,${cy} Q0,${cy - 6} 4.2,${cy} L4.2,${cy - 0.5} Q0,${cy - 4.5} -4.2,${cy - 0.5} Z`} fill={STEEL} />
          <rect x={-4.2} y={cy - 0.6} width={8.4} height={1.6} fill={STEEL_DARK} />
          <rect x={-0.8} y={cy - 0.4} width={1.6} height={3.6} fill={STEEL_DARK} />
        </g>
      );
    case 'crest':
      return (
        <g>
          <circle cx={0} cy={cy} r={4} fill={SKIN} />
          <path d={`M-4.2,${cy} Q0,${cy - 6} 4.2,${cy} L4.2,${cy} Q0,${cy - 4.5} -4.2,${cy} Z`} fill={STEEL} />
          <rect x={-4.2} y={cy - 0.2} width={8.4} height={1.4} fill={STEEL_DARK} />
          {/* plumet */}
          <path d={`M0,${cy - 5.5} Q3,${cy - 9} 1,${cy - 3}`} fill={lighten(accent, 0.15)} />
        </g>
      );
    case 'closed':
      return (
        <g>
          <path d={`M-4,${cy + 3} Q-4.4,${cy - 5} 0,${cy - 5} Q4.4,${cy - 5} 4,${cy + 3} Z`} fill={STEEL} />
          <path d={`M-4,${cy - 1} L4,${cy - 1}`} stroke={darken(accent, 0.2)} strokeWidth={1.4} />
          <circle cx={-1.6} cy={cy - 0.4} r={0.8} fill={accent} />
          <circle cx={1.6} cy={cy - 0.4} r={0.8} fill={accent} />
        </g>
      );
    case 'hood':
      return (
        <g>
          <path d={`M-4.4,${cy + 4} Q-5,${cy - 6} 0,${cy - 6} Q5,${cy - 6} 4.4,${cy + 4} Z`} fill={hood} />
          <path d={`M-2.8,${cy + 1.5} Q0,${cy - 3} 2.8,${cy + 1.5} Q0,${cy + 2} -2.8,${cy + 1.5} Z`} fill="#1a1420" />
          <circle cx={-1.1} cy={cy - 0.2} r={0.7} fill={lighten(accent, 0.4)} />
          <circle cx={1.1} cy={cy - 0.2} r={0.7} fill={lighten(accent, 0.4)} />
        </g>
      );
    case 'hat':
      return (
        <g>
          <circle cx={0} cy={cy} r={3.8} fill={SKIN} />
          <path d={`M-6,${cy - 1.5} L6,${cy - 1.5} L1.5,${cy - 12} Q0,${cy - 13} -0.6,${cy - 11} Z`} fill={darken(accent, 0.2)} />
          <path d={`M-6,${cy - 1.5} L6,${cy - 1.5} L4,${cy - 4} L-4,${cy - 4} Z`} fill={darken(accent, 0.4)} />
          <circle cx={0.9} cy={cy - 11.4} r={1} fill={lighten(accent, 0.3)} />
        </g>
      );
    case 'halo':
      return (
        <g>
          <path d={`M-4.4,${cy + 4} Q-5,${cy - 6} 0,${cy - 6} Q5,${cy - 6} 4.4,${cy + 4} Z`} fill={hood} />
          <ellipse cx={0} cy={cy - 6.5} rx={4.4} ry={1.4} fill="none" stroke={lighten(accent, 0.4)} strokeWidth={1} opacity={0.9}>
            <animate attributeName="opacity" values="0.5;1;0.5" dur="2.6s" repeatCount="indefinite" />
          </ellipse>
          <circle cx={0} cy={cy - 0.5} r={2.6} fill={SKIN} />
        </g>
      );
  }
}

/** Bras avant + arme, dessinés vers la droite (avant). */
function Weapon({ accent, weapon }: { accent: string; weapon: Weapon }) {
  const arm = darken(accent, 0.15);
  const armBase = (
    <path d="M4,-19 Q8,-18 9.5,-15.5" stroke={arm} strokeWidth={2.4} fill="none" strokeLinecap="round" />
  );
  switch (weapon) {
    case 'sword':
      return (
        <g>
          {armBase}
          <line x1={9.5} y1={-15.5} x2={16} y2={-28} stroke={STEEL} strokeWidth={2} strokeLinecap="round" />
          <line x1={9.5} y1={-15.5} x2={16} y2={-28} stroke={lighten(STEEL, 0.4)} strokeWidth={0.7} strokeLinecap="round" />
          <line x1={7.5} y1={-14.5} x2={11.5} y2={-16.5} stroke={darken(accent, 0.5)} strokeWidth={1.6} strokeLinecap="round" />
        </g>
      );
    case 'flamesword':
      return (
        <g>
          {armBase}
          <line x1={9.5} y1={-15.5} x2={16} y2={-28} stroke={STEEL} strokeWidth={2.2} strokeLinecap="round" />
          <line x1={9.5} y1={-15.5} x2={16} y2={-28} stroke="#ff7a3a" strokeWidth={3.6} strokeLinecap="round" opacity={0.4}>
            <animate attributeName="opacity" values="0.25;0.6;0.25" dur="1.1s" repeatCount="indefinite" />
          </line>
          <line x1={7.5} y1={-14.5} x2={11.5} y2={-16.5} stroke={darken(accent, 0.5)} strokeWidth={1.6} strokeLinecap="round" />
        </g>
      );
    case 'dagger':
      return (
        <g>
          {armBase}
          <line x1={9.5} y1={-15.5} x2={13.5} y2={-21} stroke={STEEL} strokeWidth={1.8} strokeLinecap="round" />
          <line x1={8.6} y1={-15} x2={11} y2={-16.2} stroke={darken(accent, 0.5)} strokeWidth={1.4} strokeLinecap="round" />
          {/* seconde dague, main arrière */}
          <line x1={-3} y1={-18} x2={-6.5} y2={-13} stroke={STEEL_DARK} strokeWidth={1.4} strokeLinecap="round" />
        </g>
      );
    case 'bow':
      return (
        <g>
          {armBase}
          <path d="M11,-26 Q17,-16 11,-6" fill="none" stroke={WOOD} strokeWidth={1.8} strokeLinecap="round" />
          <line x1={11} y1={-26} x2={11} y2={-6} stroke="#d8d2c0" strokeWidth={0.6} />
          {/* flèche encochée */}
          <line x1={11} y1={-16} x2={4} y2={-16} stroke={STEEL} strokeWidth={1} />
          <polygon points="4,-16 6.5,-14.6 6.5,-17.4" fill={STEEL} />
        </g>
      );
    case 'staff':
      return (
        <g>
          {armBase}
          <line x1={10.5} y1={-2} x2={11.8} y2={-28} stroke={WOOD} strokeWidth={2} strokeLinecap="round" />
          <circle cx={12} cy={-30} r={3.4} fill={lighten(accent, 0.15)} opacity={0.9}>
            <animate attributeName="opacity" values="0.6;1;0.6" dur="2.2s" repeatCount="indefinite" />
          </circle>
          <circle cx={12} cy={-30} r={1.6} fill="#fff" opacity={0.85} />
        </g>
      );
    case 'sceptre':
      return (
        <g>
          {armBase}
          <line x1={10.5} y1={-4} x2={11.6} y2={-24} stroke={lighten(WOOD, 0.2)} strokeWidth={1.8} strokeLinecap="round" />
          <path d={`M11.8,-27 l2.4,2.4 l-2.4,2.4 l-2.4,-2.4 Z`} fill={lighten(accent, 0.2)}>
            <animate attributeName="opacity" values="0.7;1;0.7" dur="2.4s" repeatCount="indefinite" />
          </path>
        </g>
      );
    case 'book':
      return (
        <g>
          {armBase}
          <g>
            <animateTransform attributeName="transform" type="translate" values="0 0;0 -1.5;0 0" dur="3s" repeatCount="indefinite" additive="sum" />
            <path d="M9,-20 L15,-20 L15,-13 L9,-13 Z" fill={darken(accent, 0.3)} />
            <path d="M12,-20 L12,-13" stroke={lighten(accent, 0.3)} strokeWidth={0.8} />
            <circle cx={12} cy={-16.5} r={1.4} fill={lighten(accent, 0.4)} opacity={0.9}>
              <animate attributeName="opacity" values="0.5;1;0.5" dur="1.8s" repeatCount="indefinite" />
            </circle>
          </g>
        </g>
      );
  }
}

function Shield({ accent }: { accent: string }) {
  return (
    <g transform="translate(6.5,-15)">
      <path d="M0,-5 L4,-4 L4,2 Q4,6 0,8 Q-4,6 -4,2 L-4,-4 Z" fill={lighten(accent, 0.1)} stroke={darken(accent, 0.4)} strokeWidth={0.8} />
      <path d="M0,-5 L0,8" stroke={darken(accent, 0.35)} strokeWidth={0.7} />
      <circle cx={0} cy={1.5} r={1.2} fill={lighten(accent, 0.35)} />
    </g>
  );
}

/* --------------------------------------------------------------- le sprite -- */

/**
 * Figure de combattant reconnaissable, dessinée autour de l'origine (pieds au sol),
 * face à DROITE. Le parent la place via <g transform> et gère les animations
 * d'attaque/impact. `idle` ajoute une respiration autonome (scène de farm) ; `dead`
 * la couche au sol (fin de combat).
 */
export function FighterSprite({
  classId,
  size = 34,
  idle = true,
  dead = false,
  shadow = true,
}: {
  classId: string;
  size?: number;
  idle?: boolean;
  dead?: boolean;
  shadow?: boolean;
}) {
  const accent = classMeta(classId).accent;
  const a = archOf(classId);
  const s = size / 34; // gabarit natif ≈ 34 px de haut

  return (
    <g transform={`scale(${s})`}>
      {shadow && <ellipse cx={0} cy={0.5} rx={9} ry={2.4} fill="#000" opacity={0.32} />}
      <g
        transform={dead ? 'translate(2,-1) rotate(82)' : undefined}
        opacity={dead ? 0.5 : 1}
        style={{ transition: 'opacity .4s' }}
      >
        {idle && !dead && (
          <animateTransform
            attributeName="transform"
            type="translate"
            values="0 0;0 -0.9;0 0"
            dur="2.4s"
            repeatCount="indefinite"
          />
        )}
        {a.cape && <Cape accent={accent} />}
        <Legs accent={accent} body={a.body} />
        <Torso accent={accent} body={a.body} />
        <Head accent={accent} head={a.head} />
        <Weapon accent={accent} weapon={a.weapon} />
        {a.shield && <Shield accent={accent} />}
      </g>
    </g>
  );
}

/* --------------------------------------------------------------- ennemis -- */

export type EnemyKind = 'normal' | 'miniboss' | 'boss';

/**
 * Sprite d'ennemi (silhouette de créature), teinté par la couleur de la zone.
 * `normal` = rôdeur à crocs, `miniboss`/`boss` = brute cornue plus imposante.
 * Dessiné face à GAUCHE (vers les alliés). Origine = pieds au sol.
 */
export function EnemySprite({
  accent,
  kind = 'normal',
  size = 34,
  idle = true,
  dead = false,
  shadow = true,
}: {
  accent: string;
  kind?: EnemyKind;
  size?: number;
  idle?: boolean;
  dead?: boolean;
  shadow?: boolean;
}) {
  const boss = kind !== 'normal';
  const body = darken(accent, boss ? 0.55 : 0.62);
  const belly = darken(accent, boss ? 0.4 : 0.5);
  const eye = lighten(accent, 0.35);
  const s = (size / 34) * (boss ? 1.25 : 1);

  return (
    <g transform={`scale(${s})`}>
      {shadow && <ellipse cx={0} cy={0.5} rx={boss ? 13 : 10} ry={2.6} fill="#000" opacity={0.38} />}
      <g
        transform={dead ? 'translate(-2,-1) rotate(-82)' : undefined}
        opacity={dead ? 0.5 : 1}
        style={{ transition: 'opacity .4s' }}
      >
        {idle && !dead && (
          <animateTransform
            attributeName="transform"
            type="translate"
            values="0 0;0 -1.1;0 0"
            dur="1.9s"
            repeatCount="indefinite"
          />
        )}
        {/* pattes */}
        <g fill={belly}>
          <rect x={-6} y={-7} width={3} height={7} rx={1.2} />
          <rect x={3} y={-7} width={3} height={7} rx={1.2} />
        </g>
        {/* corps trapu */}
        <ellipse cx={0} cy={-13} rx={boss ? 13 : 11} ry={boss ? 12 : 10} fill={body} />
        <ellipse cx={0} cy={-9} rx={boss ? 9 : 7.5} ry={boss ? 6 : 5} fill={belly} opacity={0.7} />
        {/* cornes */}
        <path d={`M-9,-21 L-13,-30 L-6,-23 Z`} fill={body} />
        <path d={`M9,-21 L13,-30 L6,-23 Z`} fill={body} />
        {/* yeux (regardent à gauche = vers les alliés) */}
        <ellipse cx={-6} cy={-15} rx={2.2} ry={2.6} fill={eye} filter="url(#zs-glow)">
          <animate attributeName="opacity" values="0.75;1;0.75" dur="1.6s" repeatCount="indefinite" />
        </ellipse>
        <ellipse cx={-1} cy={-15} rx={2} ry={2.4} fill={eye} filter="url(#zs-glow)">
          <animate attributeName="opacity" values="0.75;1;0.75" dur="1.6s" repeatCount="indefinite" />
        </ellipse>
        <circle cx={-6} cy={-14.5} r={0.9} fill="#1a1018" />
        <circle cx={-1} cy={-14.5} r={0.8} fill="#1a1018" />
        {/* crocs */}
        <polygon points="-5,-7 -3.6,-3 -2.2,-7" fill="#f2e9d8" />
        <polygon points="1,-7 2.4,-3.4 3.8,-7" fill="#f2e9d8" />
        {boss && (
          <>
            {/* crête dorsale du boss */}
            <path d="M-10,-20 L-6,-27 L-2,-21 L2,-27 L6,-21 L10,-24" fill="none" stroke={darken(accent, 0.3)} strokeWidth={1.6} />
          </>
        )}
      </g>
    </g>
  );
}
