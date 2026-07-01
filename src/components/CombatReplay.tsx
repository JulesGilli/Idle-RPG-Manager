import { useEffect, useMemo, useRef, useState } from 'react';
import type { CombatEvent, CombatantFinalState } from '@shared/combat';

export type StoredCombat = {
  rounds: number;
  result: 'win' | 'loss';
  events: CombatEvent[];
  final_state: CombatantFinalState[];
};

const REVEAL_MS = 420;

const EVENT_ICON: Record<CombatEvent['type'], string> = {
  attack: '⚔️',
  heal: '✚',
  death: '💀',
  end: '✦',
};

function eventClass(type: CombatEvent['type']): string {
  switch (type) {
    case 'heal':
      return 'text-emerald-300';
    case 'death':
      return 'text-[var(--color-ember)]';
    case 'end':
      return 'font-semibold text-[var(--color-gold)]';
    default:
      return 'text-[var(--color-ink)]/85';
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

export function CombatReplay({ combat, onClose }: { combat: StoredCombat; onClose: () => void }) {
  const [visible, setVisible] = useState(1);
  const done = visible >= combat.events.length;
  const logRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="panel anim-pop flex max-h-[90vh] w-full max-w-2xl flex-col">
        <div className="flex items-center justify-between border-b border-[var(--color-edge)] px-5 py-3">
          <h3 className="font-display font-semibold text-[var(--color-ink)]">
            Replay du dernier combat
          </h3>
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
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-widest text-emerald-300/80">
              Ton escouade
            </div>
            {allies.map((c) => (
              <HpBar key={c.id} c={c} hp={hpMap.get(c.id) ?? c.maxHp} />
            ))}
          </div>
          <div className="space-y-2">
            <div className="text-right text-[10px] uppercase tracking-widest text-rose-300/80">
              Ennemis
            </div>
            {enemies.map((c) => (
              <HpBar key={c.id} c={c} hp={hpMap.get(c.id) ?? c.maxHp} />
            ))}
          </div>
        </div>

        <div className="divider mx-5" />

        <div ref={logRef} className="flex-1 space-y-1 overflow-y-auto px-5 py-3 text-sm">
          {shown.map((e, i) => (
            <div key={i} className={`anim-float flex items-start gap-2 ${eventClass(e.type)}`}>
              <span className="mt-0.5 text-xs">{EVENT_ICON[e.type]}</span>
              <span>{e.message}</span>
            </div>
          ))}
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
          </div>
        )}
      </div>
    </div>
  );
}
