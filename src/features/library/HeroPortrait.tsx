/**
 * Portrait du héros sélectionné dans la Bibliothèque : petite scène 100 % SVG qui
 * met en valeur l'avatar de la classe (réutilise <FighterSprite>) sur un socle
 * runique, dans une aura teintée par la couleur de classe, avec particules montantes.
 * Purement décoratif.
 */
import { FighterSprite } from '@/components/combat/FighterSprite';
import { classMeta } from '@/lib/gameUi';

export function HeroPortrait({ classId }: { classId: string }) {
  const accent = classMeta(classId).accent;
  const cx = 65;
  const feet = 134;
  return (
    <div className="shrink-0 overflow-hidden rounded-xl border" style={{ borderColor: `${accent}55` }}>
      <svg viewBox="0 0 130 150" width="122" className="block" role="img" aria-label={`Portrait ${classMeta(classId).label}`}>
        <defs>
          <linearGradient id="hp-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#171320" />
            <stop offset="100%" stopColor="#0e0b16" />
          </linearGradient>
          <radialGradient id="hp-aura" cx="0.5" cy="0.42" r="0.55">
            <stop offset="0%" stopColor={accent} stopOpacity="0.42" />
            <stop offset="70%" stopColor={accent} stopOpacity="0.08" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="hp-vig" cx="0.5" cy="0.5" r="0.6">
            <stop offset="60%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.35" />
          </radialGradient>
          <filter id="zs-glow" x="-70%" y="-70%" width="240%" height="240%">
            <feGaussianBlur stdDeviation="1.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="hp-blur" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>

        <rect x="0" y="0" width="130" height="150" fill="url(#hp-bg)" />

        {/* Rayons doux derrière le héros */}
        <g opacity="0.5">
          <animateTransform attributeName="transform" type="rotate" values={`0 ${cx} 78;360 ${cx} 78`} dur="40s" repeatCount="indefinite" />
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <polygon key={a} points={`${cx},78 ${cx - 5},158 ${cx + 5},158`} fill={accent} opacity="0.06" transform={`rotate(${a} ${cx} 78)`} />
          ))}
        </g>

        {/* Aura */}
        <ellipse cx={cx} cy="82" rx="60" ry="66" fill="url(#hp-aura)" filter="url(#hp-blur)" />

        {/* Socle runique */}
        <ellipse cx={cx} cy={feet + 8} rx="40" ry="9" fill="#000" opacity="0.35" />
        <ellipse cx={cx} cy={feet + 4} rx="38" ry="8.5" fill="#1c1726" stroke={`${accent}66`} strokeWidth="1" />
        <ellipse cx={cx} cy={feet + 2} rx="30" ry="6" fill="none" stroke={accent} strokeWidth="1" opacity="0.7">
          <animate attributeName="opacity" values="0.35;0.8;0.35" dur="3s" repeatCount="indefinite" />
        </ellipse>
        {[0, 72, 144, 216, 288].map((a) => {
          const r = (a * Math.PI) / 180;
          return <circle key={a} cx={cx + Math.cos(r) * 30} cy={feet + 2 + Math.sin(r) * 6} r="1.1" fill={accent} filter="url(#zs-glow)" />;
        })}

        {/* Particules montantes */}
        {[38, 62, 90, 50, 78].map((x, i) => (
          <circle key={i} cx={x} cy={130} r={i % 2 ? 1.3 : 0.9} fill={accent} filter="url(#zs-glow)">
            <animate attributeName="cy" values="130;24" dur={`${3.5 + (i % 3)}s`} begin={`${i * 0.6}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;0.9;0" dur={`${3.5 + (i % 3)}s`} begin={`${i * 0.6}s`} repeatCount="indefinite" />
          </circle>
        ))}

        {/* Avatar de la classe (mis en valeur) */}
        <g transform={`translate(${cx},${feet})`}>
          <FighterSprite classId={classId} size={92} />
        </g>

        {/* Vignette */}
        <rect x="0" y="0" width="130" height="150" fill="url(#hp-vig)" />
      </svg>
    </div>
  );
}
