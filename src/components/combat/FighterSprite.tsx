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

/* ------------------------------------------------------------ squelettes -- */

const BONE = '#ece7d4';
const BONE_MID = '#cfc7ad';

/** Type d'un squelette invoqué : rôle (silhouette/arme) + rang (sbire/héros/colosse). */
export type SkeletonKind = 'melee' | 'ranged' | 'caster';
export type SkeletonTier = 'minion' | 'hero' | 'colossus';
export type SkeletonVariant = { kind: SkeletonKind; tier: SkeletonTier };

/** Déduit le style de squelette depuis le NOM de l'invocation (ordre = spécifique d'abord). */
export function skeletonVariant(name: string): SkeletonVariant {
  const n = name.toLowerCase();
  if (n.includes('mortuaire') || n.includes('colosse') || n.includes('créature')) return { kind: 'melee', tier: 'colossus' };
  const hero = n.includes('champion') || n.includes('élite') || n.includes('elite') || n.includes('archimage');
  const tier: SkeletonTier = hero ? 'hero' : 'minion';
  if (n.includes('archimage') || n.includes('mage')) return { kind: 'caster', tier };
  if (n.includes('archer')) return { kind: 'ranged', tier };
  return { kind: 'melee', tier };
}

/** Lueur des orbites selon le rang/rôle. */
function skeletonGlow(v: SkeletonVariant): string {
  if (v.tier === 'colossus') return '#7cc6f7';
  if (v.tier === 'hero') return '#f5d76e';
  return v.kind === 'ranged' ? '#8ade8a' : v.kind === 'caster' ? '#c084fc' : '#ff6b5a';
}

function Skull({ cy, glow, crown }: { cy: number; glow: string; crown?: boolean }) {
  return (
    <g>
      {/* crâne */}
      <path d={`M-3.8,${cy + 2} Q-4.4,${cy - 5} 0,${cy - 5} Q4.4,${cy - 5} 3.8,${cy + 2} L2.6,${cy + 2.2} Q0,${cy + 3.4} -2.6,${cy + 2.2} Z`} fill={BONE} />
      <path d={`M-3.8,${cy + 2} Q-4.4,${cy - 5} 0,${cy - 5} Q1,${cy - 4} 1,${cy + 2} Z`} fill={BONE_MID} opacity={0.5} />
      {/* orbites lumineuses */}
      <circle cx={-1.7} cy={cy - 0.6} r={1.5} fill="#141018" />
      <circle cx={1.7} cy={cy - 0.6} r={1.5} fill="#141018" />
      <circle cx={-1.7} cy={cy - 0.6} r={0.95} fill={glow} filter="url(#zs-glow)">
        <animate attributeName="opacity" values="0.6;1;0.6" dur="2.1s" repeatCount="indefinite" />
      </circle>
      <circle cx={1.7} cy={cy - 0.6} r={0.95} fill={glow} filter="url(#zs-glow)">
        <animate attributeName="opacity" values="0.6;1;0.6" dur="2.1s" repeatCount="indefinite" />
      </circle>
      {/* mâchoire / dents */}
      <rect x={-2.4} y={cy + 1.8} width={4.8} height={1.5} fill={BONE_MID} />
      <path d={`M-2.2,${cy + 1.8} L-2.2,${cy + 3.2} M-0.7,${cy + 1.8} L-0.7,${cy + 3.2} M0.7,${cy + 1.8} L0.7,${cy + 3.2} M2.2,${cy + 1.8} L2.2,${cy + 3.2}`} stroke="#141018" strokeWidth={0.4} />
      {/* couronne / cornes (héros) */}
      {crown && (
        <path d={`M-4,${cy - 4} L-4.6,${cy - 8} L-2.2,${cy - 5.4} L0,${cy - 9} L2.2,${cy - 5.4} L4.6,${cy - 8} L4,${cy - 4} Z`} fill={glow} opacity={0.9} stroke={darken(glow, 0.25)} strokeWidth={0.4} />
      )}
    </g>
  );
}

function Ribcage({ glow, core }: { glow: string; core?: boolean }) {
  return (
    <g stroke={BONE} strokeWidth={1.1} fill="none" strokeLinecap="round">
      {/* colonne */}
      <line x1={0} y1={-21} x2={0} y2={-9} stroke={BONE_MID} strokeWidth={1.4} />
      {/* côtes */}
      <path d="M0,-19 Q-4.6,-18 -3.8,-14" />
      <path d="M0,-19 Q4.6,-18 3.8,-14" />
      <path d="M0,-16.5 Q-5,-15.5 -4,-11.5" />
      <path d="M0,-16.5 Q5,-15.5 4,-11.5" />
      <path d="M0,-14 Q-4.4,-13 -3.4,-9.5" />
      <path d="M0,-14 Q4.4,-13 3.4,-9.5" />
      {/* bassin */}
      <path d="M-3.6,-9 Q0,-6 3.6,-9" strokeWidth={1.3} />
      {/* cœur nécromantique (colosse) */}
      {core && (
        <circle cx={0} cy={-15} r={2.4} fill={glow} stroke="none" filter="url(#zs-glow)">
          <animate attributeName="opacity" values="0.55;1;0.55" dur="1.6s" repeatCount="indefinite" />
        </circle>
      )}
    </g>
  );
}

function BoneLegs() {
  return (
    <g stroke={BONE} strokeWidth={1.5} strokeLinecap="round">
      <line x1={-2} y1={-9} x2={-2.6} y2={0} />
      <line x1={2} y1={-9} x2={2.6} y2={0} />
      <line x1={-2.6} y1={0} x2={-4} y2={0.4} strokeWidth={1.8} />
      <line x1={2.6} y1={0} x2={4} y2={0.4} strokeWidth={1.8} />
    </g>
  );
}

/** Arme du squelette selon son rôle (teinte os/rouille, orbe magique pour le mage). */
function BoneWeapon({ kind, glow, hero }: { kind: SkeletonKind; glow: string; hero?: boolean }) {
  const armBase = <path d="M3.6,-18 Q7.5,-17 9,-14.5" stroke={BONE_MID} strokeWidth={2} fill="none" strokeLinecap="round" />;
  if (kind === 'ranged') {
    return (
      <g>
        {armBase}
        <path d="M10,-25 Q16,-15.5 10,-6" fill="none" stroke={BONE} strokeWidth={hero ? 2 : 1.6} strokeLinecap="round" />
        <line x1={10} y1={-25} x2={10} y2={-6} stroke={glow} strokeWidth={0.6} opacity={0.7} />
        <line x1={10} y1={-15.5} x2={3.5} y2={-15.5} stroke={BONE_MID} strokeWidth={1} />
        <polygon points="3.5,-15.5 6,-14.2 6,-16.8" fill={glow} />
      </g>
    );
  }
  if (kind === 'caster') {
    return (
      <g>
        {armBase}
        <line x1={9.5} y1={-2} x2={11} y2={-27} stroke={BONE_MID} strokeWidth={2} strokeLinecap="round" />
        {/* mini-crâne au sommet du bâton */}
        <circle cx={11.4} cy={-29.5} r={hero ? 2.8 : 2.2} fill={BONE} />
        <circle cx={10.6} cy={-29.8} r={0.7} fill={glow} filter="url(#zs-glow)">
          <animate attributeName="opacity" values="0.5;1;0.5" dur="1.8s" repeatCount="indefinite" />
        </circle>
        <circle cx={12.2} cy={-29.8} r={0.7} fill={glow} filter="url(#zs-glow)" />
      </g>
    );
  }
  // melee : lame rouillée (+ plus grande pour le héros)
  const tip = hero ? -30 : -27;
  return (
    <g>
      {armBase}
      <line x1={9} y1={-14.5} x2={15.5} y2={tip} stroke={STEEL_DARK} strokeWidth={hero ? 2.4 : 2} strokeLinecap="round" />
      <line x1={9} y1={-14.5} x2={15.5} y2={tip} stroke={lighten(STEEL_DARK, 0.3)} strokeWidth={0.6} strokeLinecap="round" />
      <line x1={7} y1={-13.5} x2={11} y2={-15.5} stroke={BONE_MID} strokeWidth={1.6} strokeLinecap="round" />
    </g>
  );
}

/** Créature mortuaire (Colosse) : masse d'ossements voûtée, cœur nécromantique, cornes. */
function BoneColossus({ glow }: { glow: string }) {
  return (
    <g>
      {/* bras/griffes traînantes */}
      <path d="M-8,-16 Q-13,-10 -11,-2" fill="none" stroke={BONE} strokeWidth={2.2} strokeLinecap="round" />
      <path d="M8,-16 Q13,-10 11,-2" fill="none" stroke={BONE} strokeWidth={2.2} strokeLinecap="round" />
      {/* jambes massives */}
      <g stroke={BONE} strokeWidth={2.6} strokeLinecap="round">
        <line x1={-3.5} y1={-11} x2={-4.5} y2={0} />
        <line x1={3.5} y1={-11} x2={4.5} y2={0} />
      </g>
      {/* cage thoracique bombée */}
      <ellipse cx={0} cy={-15} rx={9} ry={9} fill={darken(BONE, 0.15)} opacity={0.25} />
      <g stroke={BONE} strokeWidth={1.5} fill="none" strokeLinecap="round">
        <line x1={0} y1={-24} x2={0} y2={-10} strokeWidth={2} />
        <path d="M0,-22 Q-8,-20 -6.5,-13" />
        <path d="M0,-22 Q8,-20 6.5,-13" />
        <path d="M0,-18.5 Q-8.5,-17 -6.8,-10.5" />
        <path d="M0,-18.5 Q8.5,-17 6.8,-10.5" />
      </g>
      {/* cœur nécromantique */}
      <circle cx={0} cy={-16} r={3.2} fill={glow} filter="url(#zs-glow)">
        <animate attributeName="opacity" values="0.5;1;0.5" dur="1.5s" repeatCount="indefinite" />
      </circle>
      {/* crâne voûté + cornes */}
      <path d="M-5,-24 L-8,-32 L-2.5,-27 Z" fill={BONE} />
      <path d="M5,-24 L8,-32 L2.5,-27 Z" fill={BONE} />
      <circle cx={0} cy={-25} r={4} fill={BONE} />
      <circle cx={-1.7} cy={-25.4} r={1} fill={glow} filter="url(#zs-glow)" />
      <circle cx={1.7} cy={-25.4} r={1} fill={glow} filter="url(#zs-glow)" />
    </g>
  );
}

/**
 * Sprite d'INVOCATION squelettique, décliné par rôle (guerrier/archer/mage) et rang
 * (sbire / héros stylé / colosse). Même convention que FighterSprite : dessiné autour
 * des pieds, face à DROITE, embarquable dans l'arène.
 */
export function SkeletonSprite({
  variant,
  size = 34,
  idle = true,
  dead = false,
  shadow = true,
}: {
  variant: SkeletonVariant;
  size?: number;
  idle?: boolean;
  dead?: boolean;
  shadow?: boolean;
}) {
  const glow = skeletonGlow(variant);
  const hero = variant.tier === 'hero';
  const colossus = variant.tier === 'colossus';
  const s = (size / 34) * (colossus ? 1.35 : hero ? 1.12 : 0.94);

  return (
    <g transform={`scale(${s})`}>
      {shadow && <ellipse cx={0} cy={0.5} rx={colossus ? 12 : 8.5} ry={2.4} fill="#000" opacity={0.34} />}
      <g
        transform={dead ? 'translate(2,-1) rotate(82)' : undefined}
        opacity={dead ? 0.5 : 1}
        style={{ transition: 'opacity .4s' }}
      >
        {idle && !dead && (
          <animateTransform attributeName="transform" type="translate" values="0 0;0 -0.7;0 0" dur="2.6s" repeatCount="indefinite" />
        )}
        {colossus ? (
          <BoneColossus glow={glow} />
        ) : (
          <>
            {/* cape en lambeaux pour le héros */}
            {hero && (
              <path d="M-4,-22 Q-10,-11 -7,0 L-2.5,-2 Q-3.5,-13 -0.5,-22 Z" fill={darken(glow, 0.4)} opacity={0.55}>
                <animateTransform attributeName="transform" type="rotate" values="-2 -4 -22;2 -4 -22;-2 -4 -22" dur="3.4s" repeatCount="indefinite" />
              </path>
            )}
            <BoneLegs />
            <Ribcage glow={glow} />
            <Skull cy={-25} glow={glow} crown={hero} />
            <BoneWeapon kind={variant.kind} glow={glow} hero={hero} />
          </>
        )}
      </g>
    </g>
  );
}

/* --------------------------------------------------------------- ennemis -- */

export type EnemyKind = 'normal' | 'miniboss' | 'boss';

/**
 * Archétype visuel d'un ennemi. Chaque espèce du bestiaire est rattachée à l'une de
 * ces silhouettes réutilisables (teintées par zone) — cf. `enemyVariant`. `generic`
 * = l'ancien rôdeur à crocs, fallback tant qu'une espèce n'a pas d'archétype dédié.
 */
export type EnemyArch =
  | 'insect'
  | 'serpent'
  | 'elemental'
  | 'brute'
  | 'beast'
  | 'imp'
  | 'golem'
  | 'undead'
  | 'aquatic'
  | 'winged'
  | 'celestial'
  | 'sphinx'
  | 'hydra'
  | 'kraken'
  | 'titan'
  | 'dragon'
  | 'generic';

/**
 * Déduit l'archétype visuel depuis le NOM du monstre (même principe que
 * `skeletonVariant`). Ordre = spécifique d'abord ; défaut = `generic`. Couvre les
 * 50 espèces des 10 zones ; 5 boss signatures ont leur propre silhouette.
 */
export function enemyVariant(name: string): EnemyArch {
  const n = name.toLowerCase();
  // Boss signatures (silhouettes dédiées).
  if (n.includes('sphinx')) return 'sphinx';
  if (n.includes('hydre')) return 'hydra';
  if (n.includes('kraken')) return 'kraken';
  if (n.includes('titan') || n.includes('colosse')) return 'titan';
  if (n.includes('dragon')) return 'dragon';
  // Ailés (avant golem/céleste : « gardien ailé » doit primer).
  if (n.includes('ailé') || n.includes('chauve') || n.includes('harpie') || n.includes('gargouille')) return 'winged';
  // Célestes (trône, astral, séraphin, archonte, écho stellaire…).
  if (
    n.includes('séraphin') || n.includes('seraphin') || n.includes('archonte') || n.includes('astral') ||
    n.includes('stellaire') || n.includes('avatar') || n.includes('trône') || n.includes('trone')
  )
    return 'celestial';
  // Morts-vivants / esprits.
  if (
    n.includes('spectre') || n.includes('revenant') || n.includes('cauchemar') || n.includes('ombre') ||
    n.includes('dévoreur') || n.includes('devoreur') || n.includes('noyé') || n.includes('noye') ||
    n.includes('fantôme') || n.includes('fantome')
  )
    return 'undead';
  // Aquatiques (tentacule, méduse, poisson).
  if (n.includes('tentacule') || n.includes('méduse') || n.includes('meduse') || n.includes('poisson') || n.includes('léviathan') || n.includes('leviathan')) return 'aquatic';
  // Serpents / anguilles.
  if (n.includes('serpent') || n.includes('anguille') || n.includes('naja')) return 'serpent';
  // Insectes / vermine.
  if (n.includes('scorpion') || n.includes('moustique') || n.includes('sangsue') || n.includes('araign')) return 'insect';
  // Élémentaires.
  if (n.includes('élémentaire') || n.includes('elementaire') || n.includes('magma')) return 'elemental';
  // Golems / constructs / sentinelles / statues / gardiens.
  if (n.includes('golem') || n.includes('statue') || n.includes('sentinelle') || n.includes('gardien')) return 'golem';
  // Petits démons / gobelins.
  if (n.includes('gobelin') || n.includes('diablotin') || n.includes('lutin')) return 'imp';
  // Bêtes quadrupèdes / reptiles.
  if (
    n.includes('loup') || n.includes('chien') || n.includes('salamandre') || n.includes('crapaud') ||
    n.includes('wendigo') || n.includes('bête') || n.includes('bete')
  )
    return 'beast';
  // Brutes humanoïdes.
  if (
    n.includes('pillard') || n.includes('nomade') || n.includes('bandit') || n.includes('ogre') ||
    n.includes('troll') || n.includes('brute') || n.includes('chef') || n.includes('tyran')
  )
    return 'brute';
  return 'generic';
}

/* ---- silhouettes d'espèces (dessinées face à GAUCHE, origine = pieds au sol) ---- */

/** Rôdeur générique (fallback) : bête trapue à cornes et crocs. */
function GenericCreature({ accent, boss }: { accent: string; boss: boolean }) {
  const body = darken(accent, boss ? 0.55 : 0.62);
  const belly = darken(accent, boss ? 0.4 : 0.5);
  const eye = lighten(accent, 0.35);
  return (
    <g>
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
      {/* yeux */}
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
        <path d="M-10,-20 L-6,-27 L-2,-21 L2,-27 L6,-21 L10,-24" fill="none" stroke={darken(accent, 0.3)} strokeWidth={1.6} />
      )}
    </g>
  );
}

/** Insecte (scorpion) : abdomen segmenté, pinces à l'avant, queue à dard enroulée. */
function InsectCreature({ accent }: { accent: string }) {
  const main = darken(accent, 0.5);
  const dark = darken(accent, 0.68);
  const eye = lighten(accent, 0.5);
  return (
    <g>
      {/* pattes */}
      <g stroke={dark} strokeWidth={1.3} strokeLinecap="round">
        <path d="M-3,-6 L-8,-1" /><path d="M-1,-6 L-5,0" />
        <path d="M1,-6 L-2,0" /><path d="M3,-6 L2,0" />
        <path d="M5,-6 L9,-1" /><path d="M6,-6 L11,0" />
      </g>
      {/* queue enroulée au-dessus, dard vers la gauche */}
      <path d="M6,-9 Q13,-14 11,-22 Q9,-28 2,-27" fill="none" stroke={main} strokeWidth={2.6} strokeLinecap="round" />
      <g fill={main} stroke={dark} strokeWidth={0.5}>
        <circle cx={9} cy={-11} r={1.7} /><circle cx={12} cy={-15} r={1.7} />
        <circle cx={11.4} cy={-19} r={1.6} /><circle cx={8.5} cy={-23} r={1.5} />
      </g>
      <path d="M2,-27 l-3.4,-1 l1.8,3 Z" fill={eye} filter="url(#zs-glow)" />
      {/* abdomen + céphalothorax */}
      <ellipse cx={3} cy={-8} rx={6.5} ry={5} fill={main} />
      <ellipse cx={2} cy={-8} rx={4} ry={3.4} fill={dark} opacity={0.5} />
      <ellipse cx={-4} cy={-8} rx={4.6} ry={4} fill={main} />
      {/* pinces vers l'avant (gauche) */}
      <g stroke={main} strokeWidth={1.8} fill="none" strokeLinecap="round">
        <path d="M-6,-9 Q-12,-11 -13,-7" /><path d="M-6,-7 Q-11,-5 -12,-9" />
      </g>
      <path d="M-13,-7 l-2.6,-1.2 l1.4,2.4 Z" fill={main} />
      <path d="M-12,-9 l-2.8,0.6 l1.8,1.8 Z" fill={main} />
      {/* yeux */}
      <circle cx={-5} cy={-10} r={0.9} fill={eye} filter="url(#zs-glow)" />
      <circle cx={-3} cy={-10} r={0.9} fill={eye} filter="url(#zs-glow)" />
    </g>
  );
}

/** Serpent : base enroulée, corps en S dressé, tête à capuchon et langue fourchue. */
function SerpentCreature({ accent }: { accent: string }) {
  const main = darken(accent, 0.5);
  const dark = darken(accent, 0.68);
  const belly = lighten(accent, 0.1);
  const eye = lighten(accent, 0.5);
  return (
    <g>
      {/* base enroulée */}
      <ellipse cx={2} cy={-3} rx={9} ry={3.4} fill={dark} />
      <ellipse cx={0} cy={-3} rx={6} ry={2.4} fill={main} />
      {/* corps en S */}
      <path d="M3,-4 Q10,-9 4,-15 Q-2,-20 -5,-25" fill="none" stroke={main} strokeWidth={5} strokeLinecap="round" />
      <path d="M3,-4 Q10,-9 4,-15 Q-2,-20 -5,-25" fill="none" stroke={belly} strokeWidth={1.6} strokeLinecap="round" opacity={0.5} />
      {/* tête + capuchon */}
      <path d="M-5,-25 Q-10,-27 -10,-23 Q-10,-20 -5,-21 Q-3,-23 -5,-25 Z" fill={main} />
      <path d="M-5,-24 Q-3,-29 0,-24 Q-2,-22 -5,-22 Z" fill={dark} opacity={0.7} />
      <circle cx={-7.5} cy={-24} r={1} fill={eye} filter="url(#zs-glow)" />
      <circle cx={-7.5} cy={-24} r={0.4} fill="#1a1018" />
      {/* langue fourchue */}
      <path d="M-10,-23 l-4,0.4 m2,-0.2 l-2,-1 m2,1 l-2,1.4" stroke="#e0555f" strokeWidth={0.7} fill="none">
        <animate attributeName="opacity" values="1;0.2;1" dur="0.7s" repeatCount="indefinite" />
      </path>
    </g>
  );
}

/** Élémentaire : masse tourbillonnante flottante, noyau lumineux, volutes. */
function ElementalCreature({ accent }: { accent: string }) {
  const main = darken(accent, 0.42);
  const dark = darken(accent, 0.6);
  const lite = lighten(accent, 0.25);
  const core = lighten(accent, 0.5);
  return (
    <g>
      <animateTransform attributeName="transform" type="translate" values="0 0;0 -1.5;0 0" dur="2.8s" repeatCount="indefinite" />
      <path d="M-8,-10 Q-10,-20 0,-22 Q11,-22 9,-10 Q11,-3 3,-4 Q0,0 -4,-4 Q-10,-4 -8,-10 Z" fill={main} />
      <path d="M-6,-11 Q-6,-18 1,-18 Q8,-18 7,-11 Q6,-7 1,-8 Q-5,-7 -6,-11 Z" fill={dark} opacity={0.55} />
      <path d="M-8,-13 Q-13,-14 -12,-9" fill="none" stroke={lite} strokeWidth={1.4} strokeLinecap="round" opacity={0.7} />
      <path d="M9,-15 Q14,-16 12,-11" fill="none" stroke={lite} strokeWidth={1.4} strokeLinecap="round" opacity={0.7} />
      <circle cx={0} cy={-12} r={3} fill={core} filter="url(#zs-glow)">
        <animate attributeName="opacity" values="0.6;1;0.6" dur="1.8s" repeatCount="indefinite" />
      </circle>
      <circle cx={-3} cy={-14} r={1} fill="#1a1018" />
      <circle cx={1} cy={-14} r={1} fill="#1a1018" />
      <circle cx={-11} cy={-6} r={0.8} fill={lite}>
        <animate attributeName="cy" values="-6;-9;-6" dur="2.2s" repeatCount="indefinite" />
      </circle>
      <circle cx={11} cy={-7} r={0.7} fill={lite}>
        <animate attributeName="cy" values="-7;-4;-7" dur="2.5s" repeatCount="indefinite" />
      </circle>
    </g>
  );
}

/** Brute humanoïde (pillard) : torse voûté, turban, cimeterre pointé à l'avant. */
function BruteCreature({ accent }: { accent: string }) {
  const main = darken(accent, 0.5);
  const dark = darken(accent, 0.66);
  const skin = '#c99a6a';
  const eye = lighten(accent, 0.5);
  return (
    <g>
      {/* jambes */}
      <g fill={dark}>
        <rect x={-4} y={-9} width={3.4} height={9} rx={1.2} />
        <rect x={1} y={-9} width={3.4} height={9} rx={1.2} />
      </g>
      {/* bras arrière */}
      <path d="M4,-19 Q8,-16 7,-11" fill="none" stroke={darken(skin, 0.15)} strokeWidth={2.6} strokeLinecap="round" />
      {/* torse voûté */}
      <path d="M-6,-20 Q0,-23 6,-19 L5,-9 L-5,-9 Z" fill={main} />
      <path d="M-6,-20 Q0,-23 6,-19 L5,-15 L-5,-15 Z" fill={dark} opacity={0.5} />
      <path d="M-5,-19 L5,-11" stroke={dark} strokeWidth={1.6} />
      {/* tête + turban */}
      <circle cx={-2} cy={-24} r={3.4} fill={skin} />
      <path d="M-6,-25 Q-2,-29 3,-26 Q2,-24 -2,-24 Q-5,-24 -6,-25 Z" fill={main} />
      <path d="M-6,-25 Q-8,-22 -5,-21" fill="none" stroke={main} strokeWidth={1.8} strokeLinecap="round" />
      <circle cx={-4} cy={-23.5} r={0.9} fill={eye} filter="url(#zs-glow)" />
      {/* bras avant + cimeterre */}
      <path d="M-4,-18 Q-9,-16 -11,-13" fill="none" stroke={darken(skin, 0.15)} strokeWidth={2.6} strokeLinecap="round" />
      <path d="M-11,-13 Q-18,-15 -19,-21" fill="none" stroke={STEEL} strokeWidth={2} strokeLinecap="round" />
      <path d="M-11,-13 Q-18,-15 -19,-21" fill="none" stroke={lighten(STEEL, 0.4)} strokeWidth={0.7} strokeLinecap="round" />
      <line x1={-9} y1={-12} x2={-12.5} y2={-14.5} stroke={dark} strokeWidth={1.6} strokeLinecap="round" />
    </g>
  );
}

/** Sphinx (boss Désert) : lion assis, némès rayé, aile repliée, regard fixe. */
function SphinxBoss({ accent }: { accent: string }) {
  const main = darken(accent, 0.4);
  const dark = darken(accent, 0.58);
  const gold = '#d9b25a';
  const goldD = '#a9822f';
  const eye = lighten(accent, 0.55);
  return (
    <g>
      {/* aile repliée */}
      <path d="M6,-20 Q18,-24 16,-10 Q12,-12 8,-11 Z" fill={dark} />
      <path d="M8,-19 Q15,-21 14,-13" fill="none" stroke={goldD} strokeWidth={0.8} />
      {/* corps de lion assis */}
      <path d="M-8,-2 Q-12,-16 0,-18 Q13,-18 12,-3 L10,0 L-6,0 Z" fill={main} />
      {/* pattes avant */}
      <g fill={dark}>
        <rect x={-11} y={-9} width={4} height={9} rx={1.4} />
        <rect x={-6} y={-9} width={4} height={9} rx={1.4} />
      </g>
      <path d="M-8,-16 Q-11,-8 -9,-1 L-6,-1 Q-7,-9 -5,-16 Z" fill={dark} opacity={0.6} />
      {/* némès (coiffe rayée) */}
      <path d="M-14,-22 Q-14,-30 -7,-30 Q-2,-30 -3,-22 Q-6,-19 -9,-19 Q-13,-20 -14,-22 Z" fill={gold} />
      <g stroke={goldD} strokeWidth={0.7}>
        <path d="M-13,-24 L-4,-24" /><path d="M-13.5,-27 L-4.5,-27" />
      </g>
      <path d="M-14,-22 L-15,-14 L-11,-15 L-11,-21 Z" fill={gold} />
      <path d="M-3,-22 L-2,-14 L-6,-15 L-6,-21 Z" fill={gold} />
      {/* visage */}
      <path d="M-12,-24 Q-8.5,-27 -5,-24 Q-6,-19 -8.5,-18.5 Q-11,-19 -12,-24 Z" fill="#bd905f" />
      <ellipse cx={-10.5} cy={-23} rx={1.3} ry={1.6} fill={eye} filter="url(#zs-glow)">
        <animate attributeName="opacity" values="0.7;1;0.7" dur="2s" repeatCount="indefinite" />
      </ellipse>
      <ellipse cx={-6.5} cy={-23} rx={1.3} ry={1.6} fill={eye} filter="url(#zs-glow)">
        <animate attributeName="opacity" values="0.7;1;0.7" dur="2s" repeatCount="indefinite" />
      </ellipse>
      <circle cx={-10.5} cy={-22.6} r={0.5} fill="#1a1018" />
      <circle cx={-6.5} cy={-22.6} r={0.5} fill="#1a1018" />
    </g>
  );
}

/** Bête quadrupède (loup, chien, salamandre) : corps bas, tête museau à l'avant. */
function BeastCreature({ accent }: { accent: string }) {
  const main = darken(accent, 0.5);
  const dark = darken(accent, 0.66);
  const eye = lighten(accent, 0.5);
  return (
    <g>
      <g fill={dark}>
        <rect x={-8} y={-7} width={2.6} height={7} rx={1} /><rect x={-3} y={-7} width={2.6} height={7} rx={1} />
        <rect x={3} y={-7} width={2.6} height={7} rx={1} /><rect x={7} y={-7} width={2.6} height={7} rx={1} />
      </g>
      <path d="M10,-12 Q16,-16 14,-9" fill="none" stroke={main} strokeWidth={2.6} strokeLinecap="round" />
      <ellipse cx={2} cy={-12} rx={10} ry={6} fill={main} />
      <ellipse cx={7} cy={-13} rx={5.5} ry={5.5} fill={main} />
      <ellipse cx={0} cy={-9} rx={6} ry={3.4} fill={dark} opacity={0.5} />
      <path d="M-6,-13 Q-11,-13 -12,-9" fill="none" stroke={main} strokeWidth={5} strokeLinecap="round" />
      <ellipse cx={-11} cy={-10} rx={4} ry={3.2} fill={main} />
      <path d="M-13,-10 l-4,1 l1,-3 Z" fill={main} />
      <path d="M-9,-13 l-1,-4 l3,2 Z" fill={dark} />
      <circle cx={-11.5} cy={-11} r={0.9} fill={eye} filter="url(#zs-glow)" />
      <path d="M-15,-9.5 l1,1.6 l1,-1.4" fill="#f2e9d8" />
    </g>
  );
}

/** Petit démon / gobelin : corps ventru, grandes oreilles pointues, rictus, queue. */
function ImpCreature({ accent }: { accent: string }) {
  const main = darken(accent, 0.5);
  const dark = darken(accent, 0.66);
  const eye = lighten(accent, 0.55);
  return (
    <g>
      <g fill={dark}>
        <rect x={-3.4} y={-6} width={2.8} height={6} rx={1} /><rect x={0.6} y={-6} width={2.8} height={6} rx={1} />
      </g>
      <path d="M4,-8 Q9,-8 8,-14" fill="none" stroke={main} strokeWidth={1.6} strokeLinecap="round" />
      <path d="M8,-14 l-1.6,-1 l0.4,2.2 Z" fill={main} />
      <ellipse cx={0} cy={-9} rx={5.5} ry={5} fill={main} />
      <ellipse cx={0} cy={-8} rx={3.4} ry={3} fill={dark} opacity={0.5} />
      <path d="M-4,-11 Q-8,-9 -9,-6" fill="none" stroke={main} strokeWidth={2} strokeLinecap="round" />
      <circle cx={-1.5} cy={-15} r={4} fill={main} />
      <path d="M-5,-15 l-6,-1 l5,-3 Z" fill={main} />
      <path d="M2,-16 l6,-2 l-3,4 Z" fill={main} />
      <ellipse cx={-3} cy={-15.5} rx={1.2} ry={0.9} fill={eye} filter="url(#zs-glow)" />
      <ellipse cx={0} cy={-15.5} rx={1.2} ry={0.9} fill={eye} filter="url(#zs-glow)" />
      <path d="M-3.5,-12.5 Q-1.5,-11 0.5,-12.5" fill="none" stroke="#1a1018" strokeWidth={0.7} />
    </g>
  );
}

/** Golem / construct : blocs empilés anguleux, rune lumineuse, yeux carrés. */
function GolemCreature({ accent }: { accent: string }) {
  const main = darken(accent, 0.48);
  const dark = darken(accent, 0.64);
  const lite = lighten(accent, 0.12);
  const rune = lighten(accent, 0.5);
  return (
    <g>
      <g fill={dark}>
        <rect x={-6} y={-8} width={4.4} height={8} rx={1} /><rect x={1.6} y={-8} width={4.4} height={8} rx={1} />
      </g>
      <rect x={-11} y={-19} width={4.2} height={12} rx={1.6} fill={main} />
      <rect x={7} y={-19} width={4.2} height={12} rx={1.6} fill={main} />
      <path d="M-8,-21 L8,-21 L6.5,-8 L-6.5,-8 Z" fill={main} />
      <path d="M-8,-21 L8,-21 L7.2,-17 L-7.2,-17 Z" fill={lite} opacity={0.6} />
      <circle cx={0} cy={-14} r={2.2} fill={rune} filter="url(#zs-glow)">
        <animate attributeName="opacity" values="0.6;1;0.6" dur="2.4s" repeatCount="indefinite" />
      </circle>
      <path d="M0,-16.4 L0,-11.6 M-2.2,-14 L2.2,-14" stroke={darken(accent, 0.2)} strokeWidth={0.6} />
      <rect x={-3.5} y={-28} width={7} height={6.5} rx={1.2} fill={main} />
      <rect x={-3.5} y={-28} width={7} height={2} fill={lite} opacity={0.5} />
      <rect x={-2.6} y={-25.5} width={1.6} height={1.4} fill={rune} filter="url(#zs-glow)" />
      <rect x={0.8} y={-25.5} width={1.6} height={1.4} fill={rune} filter="url(#zs-glow)" />
    </g>
  );
}

/** Mort-vivant / esprit : voile flottant effiloché, capuche sombre, yeux lumineux. */
function UndeadCreature({ accent }: { accent: string }) {
  const robe = darken(accent, 0.55);
  const dark = darken(accent, 0.7);
  const glow = lighten(accent, 0.5);
  return (
    <g>
      <path d="M-7,-8 Q-8,-22 0,-24 Q8,-22 7,-8 Q5,-3 4,-6 Q2.5,-1 1,-5 Q-0.5,-1 -2,-5 Q-3.5,-2 -5,-6 Q-6,-3 -7,-8 Z" fill={robe}>
        <animate attributeName="opacity" values="0.9;1;0.9" dur="3s" repeatCount="indefinite" />
      </path>
      <path d="M-5,-10 Q-5,-20 0,-21 Q5,-20 5,-10 Z" fill={dark} opacity={0.5} />
      <path d="M-6,-16 Q-11,-15 -12,-11" fill="none" stroke={robe} strokeWidth={2} strokeLinecap="round" />
      <path d="M6,-16 Q10,-16 11,-12" fill="none" stroke={robe} strokeWidth={2} strokeLinecap="round" />
      <path d="M-4.6,-19 Q-5,-26 0,-26 Q5,-26 4.6,-19 Q2,-16.5 0,-16.5 Q-2,-16.5 -4.6,-19 Z" fill={dark} />
      <ellipse cx={-2.4} cy={-21} rx={1.1} ry={1.5} fill={glow} filter="url(#zs-glow)">
        <animate attributeName="opacity" values="0.5;1;0.5" dur="2s" repeatCount="indefinite" />
      </ellipse>
      <ellipse cx={1} cy={-21} rx={1.1} ry={1.5} fill={glow} filter="url(#zs-glow)">
        <animate attributeName="opacity" values="0.5;1;0.5" dur="2s" repeatCount="indefinite" />
      </ellipse>
    </g>
  );
}

/** Aquatique (méduse / tentacule) : cloche bioluminescente, tentacules ondulants. */
function AquaticCreature({ accent }: { accent: string }) {
  const bell = darken(accent, 0.44);
  const dark = darken(accent, 0.62);
  const glow = lighten(accent, 0.45);
  return (
    <g>
      <g fill="none" stroke={bell} strokeWidth={1.6} strokeLinecap="round">
        <path d="M-6,-12 Q-7,-6 -5,0">
          <animate attributeName="d" values="M-6,-12 Q-7,-6 -5,0;M-6,-12 Q-5,-6 -6,0;M-6,-12 Q-7,-6 -5,0" dur="3s" repeatCount="indefinite" />
        </path>
        <path d="M-2,-13 Q-3,-6 -2,0" />
        <path d="M2,-13 Q3,-6 2,0">
          <animate attributeName="d" values="M2,-13 Q3,-6 2,0;M2,-13 Q1,-6 3,0;M2,-13 Q3,-6 2,0" dur="3.4s" repeatCount="indefinite" />
        </path>
        <path d="M6,-12 Q7,-6 5,0" />
      </g>
      <path d="M-8,-13 Q-8,-24 0,-24 Q8,-24 8,-13 Q4,-10 0,-11 Q-4,-10 -8,-13 Z" fill={bell} />
      <path d="M-8,-13 Q-8,-24 0,-24 Q8,-24 8,-13 Q4,-16 0,-16 Q-4,-16 -8,-13 Z" fill={dark} opacity={0.4} />
      <circle cx={0} cy={-18} r={2.4} fill={glow} filter="url(#zs-glow)">
        <animate attributeName="opacity" values="0.5;1;0.5" dur="2.2s" repeatCount="indefinite" />
      </circle>
      <circle cx={-3.5} cy={-16} r={0.9} fill={glow} filter="url(#zs-glow)" />
      <circle cx={3.5} cy={-16} r={0.9} fill={glow} filter="url(#zs-glow)" />
    </g>
  );
}

/** Ailé (chauve-souris, harpie, gargouille) : buste dressé, larges ailes membraneuses. */
function WingedCreature({ accent }: { accent: string }) {
  const main = darken(accent, 0.52);
  const dark = darken(accent, 0.68);
  const eye = lighten(accent, 0.5);
  return (
    <g>
      <g stroke={dark} strokeWidth={1.4} strokeLinecap="round">
        <path d="M-2,-6 L-3,0 M-2,-6 L-1,0" /><path d="M2,-6 L1,0 M2,-6 L3,0" />
      </g>
      <path d="M3,-18 Q14,-22 16,-11 Q11,-12 8,-14 Q12,-10 9,-9 Z" fill={dark} />
      <ellipse cx={0} cy={-11} rx={4.4} ry={5.5} fill={main} />
      <path d="M-3,-18 Q-15,-22 -17,-10 Q-12,-12 -9,-14 Q-13,-9 -10,-8 Q-6,-11 -3,-12 Z" fill={main} />
      <path d="M-3,-17 Q-11,-19 -15,-11" fill="none" stroke={dark} strokeWidth={0.7} />
      <circle cx={-2} cy={-18} r={3.2} fill={main} />
      <path d="M-4,-20 l-1,-3 l2,1.4 Z" fill={main} /><path d="M0,-20 l1,-3 l-2,1.4 Z" fill={main} />
      <circle cx={-3.4} cy={-18} r={0.9} fill={eye} filter="url(#zs-glow)" />
      <circle cx={-0.6} cy={-18} r={0.9} fill={eye} filter="url(#zs-glow)" />
    </g>
  );
}

/** Céleste (séraphin, archonte, avatar) : robe rayonnante, halo, ailes de plumes. */
function CelestialCreature({ accent }: { accent: string }) {
  const robe = darken(accent, 0.34);
  const dark = darken(accent, 0.5);
  const light = lighten(accent, 0.3);
  const glow = lighten(accent, 0.6);
  return (
    <g>
      <path d="M4,-24 Q16,-26 18,-12 Q11,-15 5,-16 Z" fill={light} opacity={0.85} />
      <path d="M-4,-24 Q-16,-26 -18,-12 Q-11,-15 -5,-16 Z" fill={dark} opacity={0.7} />
      <path d="M-5,-22 L5,-22 L9,0 L-9,0 Z" fill={robe} />
      <path d="M0,-22 L5,-22 L9,0 L0,0 Z" fill={dark} opacity={0.4} />
      <path d="M-5,-22 Q0,-25 5,-22 L4,-15 L-4,-15 Z" fill={lighten(accent, 0.14)} />
      <ellipse cx={0} cy={-30} rx={4.4} ry={1.5} fill="none" stroke={glow} strokeWidth={1} filter="url(#zs-glow)">
        <animate attributeName="opacity" values="0.5;1;0.5" dur="2.6s" repeatCount="indefinite" />
      </ellipse>
      <circle cx={0} cy={-25} r={2.8} fill={lighten(accent, 0.2)} />
      <circle cx={0} cy={-16} r={2} fill={glow} filter="url(#zs-glow)">
        <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite" />
      </circle>
    </g>
  );
}

/** Hydre (boss) : masse enroulée, trois cous et têtes. */
function HydraBoss({ accent }: { accent: string }) {
  const main = darken(accent, 0.5);
  const dark = darken(accent, 0.66);
  const belly = lighten(accent, 0.1);
  const eye = lighten(accent, 0.5);
  const neck = (d: string, key: string) => (
    <g key={key}>
      <path d={d} fill="none" stroke={main} strokeWidth={4} strokeLinecap="round" />
      <path d={d} fill="none" stroke={belly} strokeWidth={1.2} strokeLinecap="round" opacity={0.4} />
    </g>
  );
  const head = (x: number, y: number, key: string) => (
    <g key={key}>
      <path d={`M${x},${y} q-4,-1 -4.4,2.2 q-0.2,2.4 3.2,2 q2,-1.4 1.2,-4.2 Z`} fill={main} />
      <circle cx={x - 2.6} cy={y + 1.4} r={0.8} fill={eye} filter="url(#zs-glow)" />
    </g>
  );
  return (
    <g>
      <ellipse cx={2} cy={-4} rx={12} ry={4.4} fill={dark} />
      <ellipse cx={0} cy={-4} rx={8} ry={3} fill={main} />
      {neck('M-2,-6 Q-10,-12 -9,-22', 'n1')}
      {neck('M2,-6 Q2,-16 -2,-24', 'n2')}
      {neck('M5,-6 Q12,-14 8,-23', 'n3')}
      {head(-9, -23, 'h1')}
      {head(-2, -25, 'h2')}
      {head(8, -24, 'h3')}
    </g>
  );
}

/** Kraken (boss) : manteau bulbeux, tentacules étalés, gros œil. */
function KrakenBoss({ accent }: { accent: string }) {
  const main = darken(accent, 0.46);
  const dark = darken(accent, 0.62);
  const eye = lighten(accent, 0.55);
  return (
    <g>
      <g fill="none" stroke={main} strokeWidth={3} strokeLinecap="round">
        <path d="M-6,-10 Q-16,-8 -18,2" /><path d="M-3,-9 Q-10,-2 -13,2" />
        <path d="M3,-9 Q10,-2 13,2" /><path d="M6,-10 Q16,-8 18,2" />
        <path d="M0,-8 Q-2,-1 -4,3" /><path d="M0,-8 Q2,-1 4,3" />
      </g>
      <g fill={dark}><circle cx={-14} cy={-2} r={0.9} /><circle cx={14} cy={-2} r={0.9} /></g>
      <path d="M-10,-12 Q-11,-30 0,-30 Q11,-30 10,-12 Q4,-8 0,-9 Q-4,-8 -10,-12 Z" fill={main} />
      <path d="M-10,-12 Q-11,-30 0,-30 Q0,-20 0,-9 Q-4,-8 -10,-12 Z" fill={dark} opacity={0.35} />
      <ellipse cx={-3.5} cy={-18} rx={3} ry={3.6} fill={eye} filter="url(#zs-glow)">
        <animate attributeName="opacity" values="0.7;1;0.7" dur="2.4s" repeatCount="indefinite" />
      </ellipse>
      <circle cx={-3.5} cy={-17} r={1.3} fill="#1a1018" />
    </g>
  );
}

/** Titan de pierre (boss) : colosse blindé, cœur runique, épaulières massives. */
function TitanBoss({ accent }: { accent: string }) {
  const main = darken(accent, 0.46);
  const dark = darken(accent, 0.62);
  const lite = lighten(accent, 0.12);
  const rune = lighten(accent, 0.5);
  return (
    <g>
      <g fill={dark}>
        <rect x={-8} y={-11} width={6} height={11} rx={1.4} /><rect x={2} y={-11} width={6} height={11} rx={1.4} />
      </g>
      <rect x={-15} y={-27} width={5.5} height={17} rx={2} fill={main} />
      <rect x={9.5} y={-27} width={5.5} height={17} rx={2} fill={main} />
      <circle cx={-12} cy={-9} r={3.4} fill={dark} /><circle cx={12} cy={-9} r={3.4} fill={dark} />
      <path d="M-11,-30 L11,-30 L8.5,-11 L-8.5,-11 Z" fill={main} />
      <path d="M-11,-30 L11,-30 L9.6,-24 L-9.6,-24 Z" fill={lite} opacity={0.5} />
      <path d="M-12,-30 L-6,-33 L-2,-29 Z" fill={dark} /><path d="M12,-30 L6,-33 L2,-29 Z" fill={dark} />
      <circle cx={0} cy={-21} r={3.2} fill={rune} filter="url(#zs-glow)">
        <animate attributeName="opacity" values="0.5;1;0.5" dur="2s" repeatCount="indefinite" />
      </circle>
      <rect x={-4} y={-38} width={8} height={7} rx={1.4} fill={main} />
      <rect x={-2.8} y={-35.5} width={1.8} height={1.6} fill={rune} filter="url(#zs-glow)" />
      <rect x={1} y={-35.5} width={1.8} height={1.6} fill={rune} filter="url(#zs-glow)" />
    </g>
  );
}

/** Dragon (boss) : reptile ailé, long cou, aile membraneuse, crête dorsale. */
function DragonBoss({ accent }: { accent: string }) {
  const main = darken(accent, 0.48);
  const dark = darken(accent, 0.64);
  const belly = lighten(accent, 0.14);
  const eye = lighten(accent, 0.55);
  return (
    <g>
      <path d="M8,-10 Q18,-8 20,-16 l2,1 l-1,-3 l-2.6,1.6" fill="none" stroke={main} strokeWidth={3} strokeLinecap="round" />
      <path d="M2,-22 Q16,-34 20,-18 Q14,-19 12,-16 Q16,-14 10,-13 Q6,-16 2,-16 Z" fill={dark} />
      <path d="M4,-22 Q14,-28 18,-19 M8,-20 Q12,-22 14,-18" fill="none" stroke={darken(accent, 0.3)} strokeWidth={0.6} />
      <g fill={dark}>
        <rect x={-4} y={-9} width={3.4} height={9} rx={1.2} /><rect x={2} y={-9} width={3.4} height={9} rx={1.2} />
      </g>
      <ellipse cx={0} cy={-14} rx={9} ry={7} fill={main} />
      <ellipse cx={0} cy={-11} rx={6} ry={4} fill={belly} opacity={0.5} />
      <path d="M-6,-17 Q-13,-19 -14,-26" fill="none" stroke={main} strokeWidth={4.5} strokeLinecap="round" />
      <path d="M-14,-26 Q-19,-27 -18,-23 Q-15,-22 -13,-24 Z" fill={main} />
      <path d="M-13,-27 l-1,-4 l2.4,2.4 Z" fill={dark} />
      <path d="M-18,-23 l-3,0.6 l2,1.4 Z" fill={main} />
      <circle cx={-15} cy={-25} r={1} fill={eye} filter="url(#zs-glow)" />
      <path d="M-6,-19 l1.5,-3 l2,3 M0,-20 l1.5,-3 l2,3" fill={dark} />
    </g>
  );
}

/**
 * Sprite d'ennemi. Si `name` est fourni, choisit une silhouette d'espèce
 * (`enemyVariant`) ; sinon retombe sur le rôdeur générique. `boss`/`miniboss`
 * agrandissent la créature. Dessiné face à GAUCHE (vers les alliés), pieds au sol.
 */
export function EnemySprite({
  accent,
  kind = 'normal',
  name,
  size = 34,
  idle = true,
  dead = false,
  shadow = true,
}: {
  accent: string;
  kind?: EnemyKind;
  name?: string;
  size?: number;
  idle?: boolean;
  dead?: boolean;
  shadow?: boolean;
}) {
  const variant = name ? enemyVariant(name) : 'generic';
  const signatureBoss =
    variant === 'sphinx' || variant === 'hydra' || variant === 'kraken' || variant === 'titan' || variant === 'dragon';
  const boss = kind !== 'normal' || signatureBoss;
  const floats = variant === 'elemental' || variant === 'aquatic' || variant === 'undead';
  const s = (size / 34) * (boss ? 1.25 : 1) * (signatureBoss ? 1.12 : 1);
  const shadowRx = signatureBoss
    ? 15
    : variant === 'serpent'
      ? 8
      : variant === 'elemental' || variant === 'aquatic'
        ? 7
        : variant === 'undead'
          ? 6
          : boss
            ? 13
            : 10;

  return (
    <g transform={`scale(${s})`}>
      {shadow && <ellipse cx={0} cy={0.5} rx={shadowRx} ry={2.4} fill="#000" opacity={floats ? 0.22 : 0.38} />}
      <g
        transform={dead ? 'translate(-2,-1) rotate(-82)' : undefined}
        opacity={dead ? 0.5 : 1}
        style={{ transition: 'opacity .4s' }}
      >
        {idle && !dead && !floats && (
          <animateTransform
            attributeName="transform"
            type="translate"
            values="0 0;0 -1.1;0 0"
            dur="1.9s"
            repeatCount="indefinite"
          />
        )}
        {variant === 'insect' ? (
          <InsectCreature accent={accent} />
        ) : variant === 'serpent' ? (
          <SerpentCreature accent={accent} />
        ) : variant === 'elemental' ? (
          <ElementalCreature accent={accent} />
        ) : variant === 'brute' ? (
          <BruteCreature accent={accent} />
        ) : variant === 'beast' ? (
          <BeastCreature accent={accent} />
        ) : variant === 'imp' ? (
          <ImpCreature accent={accent} />
        ) : variant === 'golem' ? (
          <GolemCreature accent={accent} />
        ) : variant === 'undead' ? (
          <UndeadCreature accent={accent} />
        ) : variant === 'aquatic' ? (
          <AquaticCreature accent={accent} />
        ) : variant === 'winged' ? (
          <WingedCreature accent={accent} />
        ) : variant === 'celestial' ? (
          <CelestialCreature accent={accent} />
        ) : variant === 'sphinx' ? (
          <SphinxBoss accent={accent} />
        ) : variant === 'hydra' ? (
          <HydraBoss accent={accent} />
        ) : variant === 'kraken' ? (
          <KrakenBoss accent={accent} />
        ) : variant === 'titan' ? (
          <TitanBoss accent={accent} />
        ) : variant === 'dragon' ? (
          <DragonBoss accent={accent} />
        ) : (
          <GenericCreature accent={accent} boss={boss} />
        )}
      </g>
    </g>
  );
}
