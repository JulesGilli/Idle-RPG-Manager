import type { HeroView } from '@/features/heroes/useHeroes';
import { useEquip } from '@/features/heroes/useItems';

const CLASS_STYLES: Record<string, { badge: string; icon: string }> = {
  tank: { badge: 'bg-sky-900 text-sky-200', icon: '🛡️' },
  dps: { badge: 'bg-rose-900 text-rose-200', icon: '⚔️' },
  healer: { badge: 'bg-emerald-900 text-emerald-200', icon: '✚' },
};

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center rounded-md bg-neutral-900 px-2 py-1">
      <span className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</span>
      <span className="font-semibold text-neutral-100">{value}</span>
    </div>
  );
}

function EquipRow({
  label,
  itemName,
  onUnequip,
  disabled,
}: {
  label: string;
  itemName: string | null;
  onUnequip: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-neutral-500">{label}</span>
      <span className="flex items-center gap-1">
        <span>{itemName ?? '—'}</span>
        {itemName && (
          <button
            onClick={onUnequip}
            disabled={disabled}
            title="Retirer"
            className="text-neutral-600 transition hover:text-red-400 disabled:opacity-40"
          >
            ✕
          </button>
        )}
      </span>
    </div>
  );
}

export function HeroCard({ hero }: { hero: HeroView }) {
  const { unequip } = useEquip();
  const style = CLASS_STYLES[hero.classId] ?? {
    badge: 'bg-neutral-800 text-neutral-300',
    icon: '❓',
  };
  const xpPct = Math.min(100, Math.round((hero.xp / hero.xpToNext) * 100));

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg">{style.icon}</span>
            <h3 className="font-semibold text-neutral-100">{hero.name}</h3>
          </div>
          <span
            className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${style.badge}`}
          >
            {hero.className} · Niv. {hero.level}
          </span>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-neutral-500">Puissance</div>
          <div className="text-lg font-bold text-amber-300">{hero.power}</div>
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-1 flex justify-between text-[10px] text-neutral-500">
          <span>XP</span>
          <span>
            {hero.xp} / {hero.xpToNext}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
          <div className="h-full bg-indigo-500" style={{ width: `${xpPct}%` }} />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2 text-sm">
        <Stat label="PV" value={hero.stats.hp} />
        <Stat label="ATK" value={hero.stats.atk} />
        <Stat label="DEF" value={hero.stats.def} />
        <Stat label="VIT" value={hero.stats.speed} />
      </div>

      <div className="mt-3 space-y-1 text-xs text-neutral-400">
        <EquipRow
          label="Arme"
          itemName={hero.weapon?.name ?? null}
          onUnequip={() => unequip.mutate({ heroId: hero.id, slot: 'weapon' })}
          disabled={unequip.isPending}
        />
        <EquipRow
          label="Armure"
          itemName={hero.armor?.name ?? null}
          onUnequip={() => unequip.mutate({ heroId: hero.id, slot: 'armor' })}
          disabled={unequip.isPending}
        />
      </div>
    </div>
  );
}
