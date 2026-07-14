/**
 * Avatar compact d'un héros : l'avatar de sa classe (réutilise <FighterSprite>) mis
 * en scène dans une petite tuile carrée teintée par la couleur de classe (aura +
 * socle + fines particules). Pensé pour les cartes de héros (équipe, taverne).
 * Purement décoratif.
 */
import { FighterSprite } from '@/components/combat/FighterSprite';
import { classMeta } from '@/lib/gameUi';

export function HeroAvatar({
  classId,
  size = 56,
  className = '',
}: {
  classId: string;
  size?: number;
  className?: string;
}) {
  const accent = classMeta(classId).accent;
  return (
    <div
      className={`shrink-0 overflow-hidden rounded-xl ${className}`}
      style={{ width: size, height: size, boxShadow: `inset 0 0 0 1px ${accent}44` }}
    >
      <svg viewBox="0 0 64 64" className="block h-full w-full" role="img" aria-label={classMeta(classId).label}>
        <defs>
          <linearGradient id="ha-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#161320" />
            <stop offset="100%" stopColor="#0d0b14" />
          </linearGradient>
          <radialGradient id={`ha-aura-${classId}`} cx="0.5" cy="0.42" r="0.55">
            <stop offset="0%" stopColor={accent} stopOpacity="0.45" />
            <stop offset="70%" stopColor={accent} stopOpacity="0.09" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </radialGradient>
          <filter id="ha-glow" x="-70%" y="-70%" width="240%" height="240%">
            <feGaussianBlur stdDeviation="0.9" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect x="0" y="0" width="64" height="64" fill="url(#ha-bg)" />
        <ellipse cx="32" cy="34" rx="30" ry="30" fill={`url(#ha-aura-${classId})`} />

        {/* Socle */}
        <ellipse cx="32" cy="58" rx="19" ry="4" fill="#000" opacity="0.35" />
        <ellipse cx="32" cy="57" rx="16" ry="3.2" fill="none" stroke={accent} strokeWidth="0.8" opacity="0.6">
          <animate attributeName="opacity" values="0.3;0.7;0.3" dur="3s" repeatCount="indefinite" />
        </ellipse>

        {/* Fines particules */}
        {[22, 42, 32].map((x, i) => (
          <circle key={i} cx={x} cy={50} r="0.8" fill={accent} filter="url(#ha-glow)">
            <animate attributeName="cy" values="50;14" dur={`${3 + i}s`} begin={`${i * 0.8}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;0.9;0" dur={`${3 + i}s`} begin={`${i * 0.8}s`} repeatCount="indefinite" />
          </circle>
        ))}

        {/* Avatar de la classe */}
        <g transform="translate(31,56)">
          <FighterSprite classId={classId} size={46} />
        </g>
      </svg>
    </div>
  );
}
