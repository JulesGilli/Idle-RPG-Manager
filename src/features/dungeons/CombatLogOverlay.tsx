import { useEffect, useMemo, useRef, useState } from 'react';
import type { CombatEvent, CombatantFinalState } from '@shared/combat';
import { rarityMeta } from '@/lib/gameUi';
import type { ResolveRunResponse } from './useResolveDungeonRun';

const REVEAL_MS = 480;

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

export function CombatLogOverlay({
  run,
  onClose,
}: {
  run: ResolveRunResponse;
  onClose: () => void;
}) {
  const [visible, setVisible] = useState(1);
  const done = visible >= run.events.length;
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (done) return;
    const timer = setTimeout(() => setVisible((v) => v + 1), REVEAL_MS);
    return () => clearTimeout(timer);
  }, [visible, done]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [visible]);

  const shownEvents = run.events.slice(0, visible);

  // Reconstruit les PV courants à partir des événements révélés.
  const hpMap = useMemo(() => {
    const map = new Map(run.final_state.map((c) => [c.id, c.maxHp]));
    for (const e of shownEvents) {
      if (e.type === 'attack' || e.type === 'heal') map.set(e.targetId, e.targetHpAfter);
    }
    return map;
  }, [run.final_state, shownEvents]);

  const allies = run.final_state.filter((c) => c.side === 'ally');
  const enemies = run.final_state.filter((c) => c.side === 'enemy');

  return (
    <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="panel anim-pop flex max-h-[90vh] w-full max-w-2xl flex-col">
        <div className="flex items-center justify-between border-b border-[var(--color-edge)] px-5 py-3">
          <h3 className="font-display font-semibold text-[var(--color-ink)]">
            Combat · tour {Math.min(visible, run.rounds)}/{run.rounds}
          </h3>
          {!done && (
            <button
              onClick={() => setVisible(run.events.length)}
              className="text-xs text-[var(--color-muted)] hover:text-[var(--color-ink)]"
            >
              Passer ⏭
            </button>
          )}
        </div>

        {/* Théâtre : deux camps */}
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

        {/* Journal */}
        <div ref={logRef} className="flex-1 space-y-1 overflow-y-auto px-5 py-3 text-sm">
          {shownEvents.map((e, i) => (
            <div key={i} className={`anim-float flex items-start gap-2 ${eventClass(e.type)}`}>
              <span className="mt-0.5 text-xs">{EVENT_ICON[e.type]}</span>
              <span>{e.message}</span>
            </div>
          ))}
        </div>

        {done && <RewardFooter run={run} onClose={onClose} />}
      </div>
    </div>
  );
}

function RewardFooter({ run, onClose }: { run: ResolveRunResponse; onClose: () => void }) {
  const win = run.result === 'win';
  return (
    <div className="anim-slide border-t border-[var(--color-edge)] px-5 py-4">
      <div
        className={`font-display mb-3 text-center text-2xl font-bold ${
          win ? 'text-[var(--color-gold)]' : 'text-[var(--color-ember)]'
        }`}
      >
        {win ? '🏆 Victoire !' : '☠ Défaite'}
      </div>

      {run.rewards && (
        <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
          <span className="anim-pop rounded-lg border border-[var(--color-arcane)]/40 bg-[var(--color-arcane)]/10 px-3 py-1.5 text-[var(--color-ink)]">
            ✨ +{run.rewards.xp} XP
          </span>
          {run.rewards.level_ups.length > 0 && (
            <span className="anim-pop rounded-lg border border-[var(--color-gold)]/40 bg-[var(--color-gold)]/10 px-3 py-1.5 text-[var(--color-gold-soft)]">
              ⬆ {run.rewards.level_ups.reduce((s, l) => s + l.levels, 0)} niveau(x)
            </span>
          )}
          {run.rewards.items.map((item, i) => {
            const r = rarityMeta(item.rarity);
            return (
              <span
                key={i}
                className={`anim-pop rounded-lg border bg-black/30 px-3 py-1.5 ${r.text} ring-1 ${r.ring}`}
              >
                🎁 {item.name}
              </span>
            );
          })}
          {run.rewards.items.length === 0 && (
            <span className="text-[var(--color-muted)]">Pas de butin cette fois.</span>
          )}
        </div>
      )}

      <button onClick={onClose} className="btn btn-arcane mt-4 w-full">
        Continuer
      </button>
    </div>
  );
}
