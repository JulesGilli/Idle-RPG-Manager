/**
 * Arène de combat animée : mise en scène visuelle du replay. Les alliés (silhouettes
 * de classe) se tiennent à gauche face à droite, les ennemis à droite face à gauche.
 * À chaque événement RÉVÉLÉ du journal, l'acteur se fend/tire, la cible encaisse
 * (secousse + éclat) et un nombre de dégâts/soin s'envole. Purement décoratif : la
 * vérité du combat reste les barres de vie + le journal ; l'arène les incarne.
 */
import { useMemo } from 'react';
import type { CombatEvent, CombatantFinalState, Side } from '@shared/combat';
import { FighterSprite, EnemySprite, fighterKind, type EnemyKind } from './FighterSprite';

const VB_W = 340;
const VB_H = 128;

type Slot = { id: string; x: number; y: number; side: Side };

/** Place une rangée de combattants en formation diagonale (pieds au sol) : chacun
 *  décalé vers le centre et vers le bas → aucun chevauchement, effet de profondeur. */
function layoutSide(list: CombatantFinalState[], side: Side): Slot[] {
  return list.slice(0, 6).map((c, i) => ({
    id: c.id,
    x: side === 'ally' ? 46 + i * 12 : VB_W - 46 - i * 12,
    y: 44 + i * 18,
    side,
  }));
}

type Action = {
  actorId: string | null;
  targetId: string | null;
  effect: 'hit' | 'heal' | 'dot';
  amount: number;
};

/** Traduit le dernier événement révélé en une action visuelle (ou rien). */
function actionFromEvent(e: CombatEvent | undefined): Action | null {
  if (!e) return null;
  if (e.type === 'attack') {
    if (e.damage <= 0) return null;
    const dot = Boolean(e.status) && (e.sourceId === undefined || e.sourceId === e.targetId);
    const actor = dot ? null : (e.sourceId ?? e.actorId);
    return { actorId: actor, targetId: e.targetId, effect: dot ? 'dot' : 'hit', amount: e.damage };
  }
  if (e.type === 'heal' && e.amount > 0) {
    return { actorId: e.actorId, targetId: e.targetId, effect: 'heal', amount: e.amount };
  }
  return null;
}

export function CombatArena({
  allies,
  enemies,
  classById,
  enemyKind = 'normal',
  event,
  eventIndex,
  hpMap,
}: {
  allies: CombatantFinalState[];
  enemies: CombatantFinalState[];
  classById: Map<string, string>;
  enemyKind?: EnemyKind;
  /** Dernier événement RÉVÉLÉ du journal (pilote l'animation courante). */
  event: CombatEvent | undefined;
  /** Index de révélation : change à chaque événement → rejoue les animations. */
  eventIndex: number;
  /** id → PV courants (pour coucher les combattants tombés). */
  hpMap: Map<string, number>;
}) {
  const slots = useMemo(() => {
    const map = new Map<string, Slot>();
    for (const s of layoutSide(allies, 'ally')) map.set(s.id, s);
    for (const s of layoutSide(enemies, 'enemy')) map.set(s.id, s);
    return map;
  }, [allies, enemies]);

  const action = actionFromEvent(event);
  const actor = action?.actorId ? slots.get(action.actorId) : undefined;
  const target = action?.targetId ? slots.get(action.targetId) : undefined;

  // Style d'attaque de l'acteur (mêlée = fente, distant/mage = projectile).
  const actorRanged = actor?.side === 'ally' && action?.actorId
    ? fighterKind(classById.get(action.actorId) ?? '') !== 'melee'
    : false;

  const renderFighter = (c: CombatantFinalState) => {
    const slot = slots.get(c.id);
    if (!slot) return null;
    const dead = (hpMap.get(c.id) ?? c.maxHp) <= 0;
    const isActor = action?.actorId === c.id;
    const isTarget = action?.targetId === c.id;
    // Jeton de remontage : ne change que pour l'acteur/la cible de l'événement
    // courant → l'animation CSS rejoue une seule fois, les autres restent stables.
    const token = isActor ? `a${eventIndex}` : isTarget ? `t${eventIndex}` : 'idle';
    const cls =
      !dead && isActor && !actorRanged
        ? c.side === 'ally'
          ? 'arena-lunge-r'
          : 'arena-lunge-l'
        : !dead && isTarget && action?.effect !== 'heal'
          ? 'arena-hit'
          : undefined;
    return (
      <g key={`${c.id}-${token}`} transform={`translate(${slot.x},${slot.y})`} className={cls}>
        {c.side === 'ally' ? (
          <FighterSprite classId={classById.get(c.id) ?? 'guerrier'} size={34} dead={dead} />
        ) : (
          <EnemySprite accent={enemyColor(enemyKind)} kind={enemyKind} size={34} dead={dead} />
        )}
      </g>
    );
  };

  return (
    <div className="relative overflow-hidden rounded-lg border border-[var(--color-edge)] bg-gradient-to-b from-black/40 to-black/10">
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="block h-auto w-full" role="img" aria-label="Arène de combat">
        <defs>
          <filter id="zs-glow" x="-70%" y="-70%" width="240%" height="240%">
            <feGaussianBlur stdDeviation="2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="arena-floor" cx="0.5" cy="0.1" r="0.9">
            <stop offset="0%" stopColor="#243042" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#0a0e16" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Sol */}
        <rect x="0" y="0" width={VB_W} height={VB_H} fill="url(#arena-floor)" />
        <line x1="0" y1={VB_H - 12} x2={VB_W} y2={VB_H - 12} stroke="#2a3546" strokeWidth="1" opacity="0.5" />
        <line x1={VB_W / 2} y1="14" x2={VB_W / 2} y2={VB_H - 14} stroke="#2a3546" strokeWidth="1" strokeDasharray="3 5" opacity="0.35" />

        {/* Combattants (rendus par profondeur : plus bas = plus proche = au-dessus) */}
        {[...allies, ...enemies]
          .slice()
          .sort((a, b) => (slots.get(a.id)?.y ?? 0) - (slots.get(b.id)?.y ?? 0))
          .map((c) => renderFighter(c))}

        {/* Projectile (distant/mage allié) : part de l'acteur vers la cible */}
        {action?.effect !== 'heal' && actorRanged && actor && target && (
          <circle key={`proj-${eventIndex}`} r="2.6" fill="#ffe6a8" filter="url(#zs-glow)">
            <animate attributeName="opacity" values="0;1;1;0" dur="0.34s" repeatCount="1" fill="freeze" />
            <animateMotion
              dur="0.34s"
              repeatCount="1"
              fill="freeze"
              path={`M${actor.x + 10},${actor.y - 16} L${target.x},${target.y - 14}`}
            />
          </circle>
        )}

        {/* Éclat d'impact sur la cible touchée */}
        {action && target && action.effect !== 'heal' && (
          <g key={`impact-${eventIndex}`} transform={`translate(${target.x},${target.y - 14})`} className="arena-impact">
            <circle r="6" fill="none" stroke="#fff2c0" strokeWidth="1.6" />
            <circle r="2.5" fill="#fff6d8" />
          </g>
        )}

        {/* Halo de soin sur la cible soignée */}
        {action?.effect === 'heal' && target && (
          <g key={`heal-${eventIndex}`} transform={`translate(${target.x},${target.y - 14})`} className="arena-impact">
            <circle r="8" fill="none" stroke="#6ee7b7" strokeWidth="1.6" opacity="0.9" />
            <path d="M0,-4 L0,4 M-4,0 L4,0" stroke="#6ee7b7" strokeWidth="1.8" strokeLinecap="round" />
          </g>
        )}

        {/* Nombre flottant (dégâts rouges / soin vert) au-dessus de la cible */}
        {action && target && (
          <text
            key={`num-${eventIndex}`}
            x={target.x}
            y={target.y - 24}
            textAnchor="middle"
            className="arena-num"
            fill={action.effect === 'heal' ? '#6ee7b7' : action.effect === 'dot' ? '#a3e635' : '#fca5a5'}
            fontSize="11"
            fontWeight="700"
            style={{ paintOrder: 'stroke' }}
            stroke="#0a0e16"
            strokeWidth="2.5"
          >
            {action.effect === 'heal' ? '+' : '-'}
            {action.amount}
          </text>
        )}
      </svg>

      <style>{`
        .arena-lunge-r { animation: arenaLungeR .34s ease-out both; }
        .arena-lunge-l { animation: arenaLungeL .34s ease-out both; }
        .arena-hit { animation: arenaHit .34s ease-out both; }
        .arena-impact { animation: arenaImpact .34s ease-out both; transform-box: fill-box; transform-origin: center; }
        .arena-num { animation: arenaNum .9s ease-out both; }
        @keyframes arenaLungeR { 0%,100% { transform: translateX(0) } 45% { transform: translateX(13px) } }
        @keyframes arenaLungeL { 0%,100% { transform: translateX(0) } 45% { transform: translateX(-13px) } }
        @keyframes arenaHit {
          0% { transform: translate(0,0) } 25% { transform: translate(-3px,0) }
          50% { transform: translate(3px,0) } 75% { transform: translate(-2px,0) } 100% { transform: translate(0,0) }
        }
        @keyframes arenaImpact { 0% { opacity: 0; transform: scale(.3) } 30% { opacity: 1; transform: scale(1) } 100% { opacity: 0; transform: scale(1.5) } }
        @keyframes arenaNum { 0% { opacity: 0; transform: translateY(4px) } 20% { opacity: 1 } 100% { opacity: 0; transform: translateY(-16px) } }
        @media (prefers-reduced-motion: reduce) {
          .arena-lunge-r,.arena-lunge-l,.arena-hit,.arena-impact,.arena-num { animation: none; }
        }
      `}</style>
    </div>
  );
}

/** Couleur d'ennemi selon sa nature (normal rosé, boss doré). */
function enemyColor(kind: EnemyKind): string {
  return kind === 'boss' ? '#f5b544' : kind === 'miniboss' ? '#f59e6a' : '#fb7185';
}
