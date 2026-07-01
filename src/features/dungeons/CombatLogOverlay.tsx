import { useEffect, useState } from 'react';
import type { CombatEvent } from '@shared/combat';
import type { ResolveRunResponse } from './useResolveDungeonRun';

const RARITY_COLOR: Record<string, string> = {
  common: 'text-neutral-300',
  rare: 'text-sky-300',
  epic: 'text-fuchsia-300',
};

function eventClass(type: CombatEvent['type']): string {
  switch (type) {
    case 'heal':
      return 'text-emerald-300';
    case 'death':
      return 'text-red-400';
    case 'end':
      return 'font-bold text-amber-300';
    default:
      return 'text-neutral-300';
  }
}

const REVEAL_MS = 550;

export function CombatLogOverlay({
  run,
  onClose,
}: {
  run: ResolveRunResponse;
  onClose: () => void;
}) {
  const [visible, setVisible] = useState(1);
  const done = visible >= run.events.length;

  useEffect(() => {
    if (done) return;
    const timer = setTimeout(() => setVisible((v) => v + 1), REVEAL_MS);
    return () => clearTimeout(timer);
  }, [visible, done]);

  const shownEvents = run.events.slice(0, visible);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-neutral-800 bg-neutral-950">
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <h3 className="font-semibold">Combat — {run.rounds} tours</h3>
          {!done && (
            <button
              onClick={() => setVisible(run.events.length)}
              className="text-xs text-neutral-400 hover:text-neutral-200"
            >
              Passer ⏭
            </button>
          )}
        </div>

        <div className="flex-1 space-y-1 overflow-y-auto px-4 py-3 text-sm">
          {shownEvents.map((e, i) => (
            <div key={i} className={eventClass(e.type)}>
              {e.type !== 'end' && <span className="mr-2 text-neutral-600">›</span>}
              {e.message}
            </div>
          ))}
        </div>

        {done && (
          <div className="border-t border-neutral-800 px-4 py-3">
            <div
              className={`mb-2 text-lg font-bold ${
                run.result === 'win' ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {run.result === 'win' ? '🏆 Victoire !' : '💀 Défaite'}
            </div>

            {run.rewards && (
              <div className="space-y-1 text-sm text-neutral-300">
                <div>
                  <span className="text-neutral-500">XP gagnée : </span>
                  <span className="font-semibold text-indigo-300">+{run.rewards.xp}</span>
                  {run.rewards.level_ups.length > 0 && (
                    <span className="ml-2 text-amber-300">
                      ⬆ {run.rewards.level_ups.reduce((s, l) => s + l.levels, 0)} niveau(x)
                    </span>
                  )}
                </div>
                {run.rewards.items.length > 0 ? (
                  run.rewards.items.map((item, i) => (
                    <div key={i}>
                      <span className="text-neutral-500">Butin : </span>
                      <span className={RARITY_COLOR[item.rarity] ?? 'text-neutral-300'}>
                        {item.name}
                      </span>
                      <span className="ml-2 text-xs text-neutral-500">
                        {[
                          item.atk_bonus ? `+${item.atk_bonus} ATK` : null,
                          item.def_bonus ? `+${item.def_bonus} DEF` : null,
                          item.hp_bonus ? `+${item.hp_bonus} PV` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-neutral-500">Pas de butin cette fois.</div>
                )}
              </div>
            )}

            <button
              onClick={onClose}
              className="mt-3 w-full rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white transition hover:bg-indigo-500"
            >
              Fermer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
