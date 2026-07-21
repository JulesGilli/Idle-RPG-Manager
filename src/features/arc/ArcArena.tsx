import { ArcBossArt } from './ArcBossArt';
import { ArcHeartsArt } from './ArcHeartsArt';

/**
 * L'arène. `hearts` bascule la scène en PHASE 2 : l'ange laisse place à ses
 * cinq cœurs de démon (cf. `ArcHeartsArt`), pour qu'on voie le changement de
 * phase sans avoir à lire le bandeau.
 */
export function ArcArena({ active, hearts = false }: { active: boolean; hearts?: boolean }) {
  const archX = [46, 116, 186, 256, 424, 494, 564, 634];
  const emberBegins = ['0s', '0.6s', '1.2s', '1.8s', '2.4s'];
  return (
    <svg viewBox="0 0 680 250" className="block h-auto w-full" role="img" aria-label="Arène du boss d'arc">
      <defs>
        <linearGradient id="ar-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#120a1c" />
          <stop offset="100%" stopColor="#080510" />
        </linearGradient>
        <radialGradient id="ar-sand" cx="0.5" cy="0.4" r="0.65">
          <stop offset="0%" stopColor={active ? '#3a2e1e' : '#241d14'} />
          <stop offset="100%" stopColor="#0e0a08" />
        </radialGradient>
        <radialGradient id="ar-aura" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#ff4b2b" stopOpacity="0.55" />
          <stop offset="55%" stopColor="#b52014" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#b52014" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="ar-flame" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#ffcf6a" stopOpacity="0.7" />
          <stop offset="60%" stopColor="#c0501f" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#c0501f" stopOpacity="0" />
        </radialGradient>
        <filter id="ar-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect x="0" y="0" width="680" height="250" fill="url(#ar-sky)" />
      <circle cx="90" cy="34" r="16" fill="#e9e1c6" opacity="0.12" />
      {[150, 240, 470, 560, 620].map((x, i) => (
        <circle key={i} cx={x} cy={20 + (i % 3) * 9} r={i % 2 ? 1.3 : 0.9} fill="#fff" opacity="0.3" />
      ))}

      {/* Gradins : tier supérieur + rangée d'arches */}
      <rect x="0" y="46" width="680" height="18" fill="#1c1730" />
      {Array.from({ length: 17 }, (_, i) => (
        <rect key={i} x={8 + i * 40} y="42" width="22" height="6" fill="#0d0a18" />
      ))}
      <rect x="0" y="64" width="680" height="90" fill="#231d38" />
      {archX.map((x, i) => (
        <path
          key={i}
          d={`M${x - 20},154 L${x - 20},110 Q${x},92 ${x + 20},110 L${x + 20},154 Z`}
          fill="#0d0a18"
        />
      ))}

      {/* Porte / herse centrale (le boss en émerge) */}
      <path d="M300,154 L300,104 Q340,80 380,104 L380,154 Z" fill="#070510" />
      {[-24, -12, 0, 12, 24].map((k) => (
        <line key={k} x1={340 + k} y1={104 + Math.abs(k) * 0.5} x2={340 + k} y2={154} stroke="#1a1526" strokeWidth="2.5" />
      ))}

      {/* Base de mur + sol de sable */}
      <rect x="0" y="150" width="680" height="24" fill="#140f1e" />
      <ellipse cx="340" cy="204" rx="322" ry="52" fill="url(#ar-sand)" />
      <ellipse cx="340" cy="204" rx="322" ry="52" fill="none" stroke="#2a2016" strokeWidth="2" opacity="0.6" />

      {/* Au centre : l'Être dressé, ou — s'il est à terre — ses cinq cœurs. */}
      {active && (hearts ? <ArcHeartsArt /> : <ArcBossArt />)}

      {/* Braseros (enflammés si un boss est présent, sinon éteints) */}
      {[110, 570].map((bx) => (
        <g key={bx} transform={`translate(${bx},186)`}>
          <path d="M-11,0 L11,0 L8,15 L-8,15 Z" fill="#241a0e" />
          <rect x="-2.5" y="15" width="5" height="10" fill="#1a1208" />
          {active ? (
            <>
              <circle cx="0" cy="-3" r="24" fill="url(#ar-flame)" />
              <g>
                <animateTransform attributeName="transform" type="scale" values="1 1;1.08 1.2;0.94 0.9;1 1" dur="0.5s" repeatCount="indefinite" />
                <path d="M0,-2 C-9,-15 -6,-28 0,-36 C6,-28 9,-15 0,-2 Z" fill="#e8631c" filter="url(#ar-glow)" />
                <path d="M0,-4 C-4,-13 -3,-22 0,-28 C3,-22 4,-13 0,-4 Z" fill="#ffcf5a" />
              </g>
            </>
          ) : (
            <circle cx="0" cy="-1" r="3" fill="#4a2410" />
          )}
        </g>
      ))}

      {/* Braises qui montent (ambiance) quand le boss est là */}
      {active &&
        emberBegins.map((begin, i) => {
          const bx = i % 2 === 0 ? 110 : 570;
          return (
            <circle key={i} cx={bx + (i - 2) * 3} cy="182" r="1.6" fill="#ffb04a">
              <animate attributeName="cy" values="182;150" dur="2.4s" begin={begin} repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.9;0" dur="2.4s" begin={begin} repeatCount="indefinite" />
            </circle>
          );
        })}
    </svg>
  );
}
