import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CombatEvent, CombatantFinalState, Side, StatusType } from '@shared/combat';
import { SyntyGlyph } from '@/components/synty/SyntyIcon';
import { STATUS_GLYPH } from '@/lib/synty';

const STATUS_TINT: Record<StatusType, string> = {
  poison: '#8ade8a',
  burn: '#fb923c',
  stun: '#facc15',
  weaken: '#c084fc',
};

export type StoredCombat = {
  rounds: number;
  result: 'win' | 'loss';
  events: CombatEvent[];
  final_state: CombatantFinalState[];
};

const REVEAL_MS = 380;

/** Côté à l'origine d'un événement (qui agit / qui meurt). */
function eventSide(e: CombatEvent, sideById: Map<string, Side>): Side | null {
  switch (e.type) {
    case 'attack':
    case 'heal':
      return sideById.get(e.actorId) ?? null;
    case 'death':
    case 'status':
      return sideById.get(e.combatantId) ?? null;
    default:
      return null;
  }
}

function HpBar({ c, hp }: { c: CombatantFinalState; hp: number }) {
  const pct = Math.max(0, Math.min(100, Math.round((hp / c.maxHp) * 100)));
  const dead = hp <= 0;
  const ally = c.side === 'ally';
  return (
    <div className={`transition-opacity ${dead ? 'opacity-40' : ''}`}>
      <div className="flex justify-between text-[11px]">
        <span className="truncate text-[var(--color-ink)]">
          {dead ? '☠ ' : ''}
          {c.name}
        </span>
        <span className="text-[var(--color-muted)]">{Math.max(0, hp)}</span>
      </div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-black/50">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            ally
              ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
              : 'bg-gradient-to-r from-rose-600 to-rose-400'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Une ligne du journal, alignée et colorée selon le côté à l'origine. */
function LogLine({ e, side }: { e: CombatEvent; side: Side | null }) {
  const ally = side === 'ally';

  if (e.type === 'heal') {
    // Soin : toujours vert (code couleur soin), aligné du côté du soigneur.
    return (
      <div className={`flex ${ally ? 'justify-start' : 'justify-end'}`}>
        <div className="max-w-[85%] rounded-lg border-l-2 border-emerald-400 bg-emerald-500/10 px-2.5 py-1 text-[12px] text-emerald-200">
          <span className="mr-1">✚</span>
          {e.message}
        </div>
      </div>
    );
  }

  if (e.type === 'status') {
    // Événement informatif (statut / cast d'ultime) : bandeau centré neutre,
    // avec l'icône Synty du statut si disponible.
    const glyph = e.status ? STATUS_GLYPH[e.status] : undefined;
    return (
      <div className="flex justify-center">
        <div className="flex max-w-[85%] items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-0.5 text-[11px] text-[var(--color-muted)]">
          {glyph && e.status && (
            <SyntyGlyph src={glyph} color={STATUS_TINT[e.status]} size={13} />
          )}
          {e.message}
        </div>
      </div>
    );
  }

  if (e.type === 'death') {
    // Mort : doré si un ennemi tombe (bon pour toi), rouge si c'est un des tiens.
    return (
      <div className={`flex ${ally ? 'justify-start' : 'justify-end'}`}>
        <div
          className={`max-w-[85%] rounded-lg px-2.5 py-1 text-[12px] font-semibold ${
            ally
              ? 'bg-rose-500/15 text-rose-200'
              : 'bg-[var(--color-gold)]/15 text-[var(--color-gold-soft)]'
          }`}
        >
          <span className="mr-1">{ally ? '☠' : '💀'}</span>
          {e.message}
        </div>
      </div>
    );
  }

  // Attaque : côté = l'attaquant. Vert à gauche (toi), rouge à droite (ennemi).
  return (
    <div className={`flex ${ally ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-2.5 py-1 text-[12px] ${
          ally
            ? 'border-l-2 border-emerald-400 bg-emerald-500/10 text-emerald-100'
            : 'border-r-2 border-rose-400 bg-rose-500/10 text-right text-rose-100'
        }`}
      >
        <span className="mr-1">{ally ? '⚔️' : '🗡️'}</span>
        {e.message}
      </div>
    </div>
  );
}

export function CombatReplay({
  combat,
  onClose,
  title = 'Replay du dernier combat',
  footer,
}: {
  combat: StoredCombat;
  onClose: () => void;
  title?: string;
  footer?: ReactNode;
}) {
  const [visible, setVisible] = useState(1);
  const done = visible >= combat.events.length;
  const logRef = useRef<HTMLDivElement>(null);

  const sideById = useMemo(
    () => new Map(combat.final_state.map((c) => [c.id, c.side])),
    [combat.final_state],
  );

  useEffect(() => {
    if (done) return;
    const timer = setTimeout(() => setVisible((v) => v + 1), REVEAL_MS);
    return () => clearTimeout(timer);
  }, [visible, done]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [visible]);

  const shown = combat.events.slice(0, visible);

  const hpMap = useMemo(() => {
    const map = new Map(combat.final_state.map((c) => [c.id, c.maxHp]));
    for (const e of shown) {
      if (e.type === 'attack' || e.type === 'heal') map.set(e.targetId, e.targetHpAfter);
    }
    return map;
  }, [combat.final_state, shown]);

  const allies = combat.final_state.filter((c) => c.side === 'ally');
  const enemies = combat.final_state.filter((c) => c.side === 'enemy');

  // Construit les lignes du journal avec des séparateurs de manche.
  const rows: ReactNode[] = [];
  let lastRound = 0;
  shown.forEach((e, i) => {
    if (e.type === 'end') return; // le bandeau final couvre déjà l'issue
    if (e.round !== lastRound) {
      lastRound = e.round;
      rows.push(
        <div key={`round-${e.round}`} className="flex items-center gap-2 py-1">
          <div className="h-px flex-1 bg-[var(--color-edge)]" />
          <span className="text-[9px] uppercase tracking-widest text-[var(--color-muted)]">
            Manche {e.round}
          </span>
          <div className="h-px flex-1 bg-[var(--color-edge)]" />
        </div>,
      );
    }
    rows.push(
      <div key={i} className="anim-float">
        <LogLine e={e} side={eventSide(e, sideById)} />
      </div>,
    );
  });

  return (
    <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="panel anim-pop flex max-h-[90vh] w-full max-w-2xl flex-col">
        <div className="flex items-center justify-between border-b border-[var(--color-edge)] px-5 py-3">
          <h3 className="font-display font-semibold text-[var(--color-ink)]">{title}</h3>
          <div className="flex items-center gap-3">
            {!done && (
              <button
                onClick={() => setVisible(combat.events.length)}
                className="text-xs text-[var(--color-muted)] hover:text-[var(--color-ink)]"
              >
                Passer ⏭
              </button>
            )}
            <button
              onClick={onClose}
              className="text-[var(--color-muted)] hover:text-[var(--color-ink)]"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 px-5 py-4">
          <div className="space-y-2 rounded-lg bg-emerald-500/[0.06] p-2">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400" /> Ton équipe
            </div>
            {allies.map((c) => (
              <HpBar key={c.id} c={c} hp={hpMap.get(c.id) ?? c.maxHp} />
            ))}
          </div>
          <div className="space-y-2 rounded-lg bg-rose-500/[0.06] p-2">
            <div className="flex items-center justify-end gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-rose-300">
              Ennemis <span className="h-2 w-2 rounded-full bg-rose-400" />
            </div>
            {enemies.map((c) => (
              <HpBar key={c.id} c={c} hp={hpMap.get(c.id) ?? c.maxHp} />
            ))}
          </div>
        </div>

        {/* Légende : lève l'ambiguïté toi (gauche/vert) vs ennemis (droite/rouge) */}
        <div className="flex items-center justify-center gap-4 border-y border-[var(--color-edge)] py-1.5 text-[10px] text-[var(--color-muted)]">
          <span className="flex items-center gap-1">
            <span className="text-emerald-300">◀ ⚔️</span> Tes actions
          </span>
          <span className="flex items-center gap-1">
            Ennemis <span className="text-rose-300">🗡️ ▶</span>
          </span>
        </div>

        <div ref={logRef} className="flex-1 space-y-1 overflow-y-auto px-5 py-3">
          {rows}
        </div>

        {done && (
          <div className="border-t border-[var(--color-edge)] px-5 py-3 text-center">
            <span
              className={`font-display text-lg font-bold ${
                combat.result === 'win' ? 'text-[var(--color-gold)]' : 'text-[var(--color-ember)]'
              }`}
            >
              {combat.result === 'win' ? '🏆 Victoire' : '☠ Défaite'}
            </span>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
