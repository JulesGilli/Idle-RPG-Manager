import type { HeroView } from '@/features/heroes/useHeroes';
import { useEquip } from '@/features/heroes/useItems';
import { useAllocateStat } from '@/features/heroes/useAllocateStat';
import { classMeta, rarityMeta } from '@/lib/gameUi';
import type { StatKey } from '@shared/progression/formulas';

function Stat({
  label,
  value,
  canAllocate,
  onAllocate,
}: {
  label: string;
  value: number;
  canAllocate: boolean;
  onAllocate: () => void;
}) {
  return (
    <div className="stat-chip">
      <span className="text-[9px] uppercase tracking-widest text-[var(--color-muted)]">
        {label}
      </span>
      <span className="text-sm font-semibold text-[var(--color-ink)]">{value}</span>
      {canAllocate && (
        <button
          onClick={onAllocate}
          className="mt-0.5 rounded bg-[var(--color-arcane)]/25 px-1.5 text-[11px] font-bold leading-4 text-[var(--color-ink)] transition hover:bg-[var(--color-arcane)]/50"
          title={`Ajouter un point en ${label}`}
        >
          +
        </button>
      )}
    </div>
  );
}

function EquipRow({
  slotIcon,
  label,
  item,
  onUnequip,
  disabled,
}: {
  slotIcon: string;
  label: string;
  item: HeroView['weapon'];
  onUnequip: () => void;
  disabled: boolean;
}) {
  const rarity = item ? rarityMeta(item.rarity) : null;
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="flex items-center gap-1.5 text-[var(--color-muted)]">
        <span>{slotIcon}</span>
        {label}
      </span>
      <span className="flex items-center gap-1.5">
        <span className={item && rarity ? rarity.text : 'text-[var(--color-muted)]/60'}>
          {item ? item.name : '—'}
        </span>
        {item && (
          <button
            onClick={onUnequip}
            disabled={disabled}
            title="Retirer"
            className="text-[var(--color-muted)]/60 transition hover:text-[var(--color-ember)] disabled:opacity-40"
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
  const allocate = useAllocateStat();
  const meta = classMeta(hero.classId);
  const xpPct = Math.min(100, Math.round((hero.xp / hero.xpToNext) * 100));

  const hasPoints = hero.statPoints > 0 && !allocate.isPending;
  const alloc = (stat: StatKey) => allocate.mutate({ heroId: hero.id, stat });

  return (
    <div className="panel panel-hover anim-slide relative overflow-hidden p-4">
      {/* accent de classe */}
      <div
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ background: `linear-gradient(90deg, transparent, ${meta.accent}, transparent)` }}
      />

      <div className="flex items-start gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl"
          style={{
            background: `radial-gradient(circle at 30% 25%, ${meta.accent}33, transparent 70%)`,
            boxShadow: `inset 0 0 0 1px ${meta.accent}55`,
          }}
        >
          {meta.icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-display truncate text-base font-semibold text-[var(--color-ink)]">
                {hero.name}
              </h3>
              <span
                className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.badge}`}
              >
                {hero.className} · Niv. {hero.level}
              </span>
            </div>
            <div className="text-right">
              <div className="text-[9px] uppercase tracking-widest text-[var(--color-muted)]">
                Puiss.
              </div>
              <div className="font-display text-lg font-bold text-[var(--color-gold)]">
                {hero.power}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* XP */}
      <div className="mt-3">
        <div className="mb-1 flex justify-between text-[10px] text-[var(--color-muted)]">
          <span>XP</span>
          <span>
            {hero.xp} / {hero.xpToNext}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/40">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[var(--color-arcane)] to-[#a78bfa] transition-all duration-500"
            style={{ width: `${xpPct}%` }}
          />
        </div>
      </div>

      {/* Points à répartir */}
      {hero.statPoints > 0 && (
        <div className="mt-3 rounded-lg border border-[var(--color-arcane)]/40 bg-[var(--color-arcane)]/10 px-3 py-1.5 text-center text-xs font-medium text-[var(--color-ink)]">
          ✨ {hero.statPoints} point(s) à répartir
        </div>
      )}

      {/* Stats */}
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        <Stat
          label="PV"
          value={hero.stats.hp}
          canAllocate={hasPoints}
          onAllocate={() => alloc('hp')}
        />
        <Stat
          label="ATK"
          value={hero.stats.atk}
          canAllocate={hasPoints}
          onAllocate={() => alloc('atk')}
        />
        <Stat
          label="DEF"
          value={hero.stats.def}
          canAllocate={hasPoints}
          onAllocate={() => alloc('def')}
        />
        <Stat
          label="VIT"
          value={hero.stats.speed}
          canAllocate={hasPoints}
          onAllocate={() => alloc('speed')}
        />
      </div>

      <div className="divider my-3" />

      <div className="space-y-1.5">
        <EquipRow
          slotIcon="🗡️"
          label="Arme"
          item={hero.weapon}
          onUnequip={() => unequip.mutate({ heroId: hero.id, slot: 'weapon' })}
          disabled={unequip.isPending}
        />
        <EquipRow
          slotIcon="🛡️"
          label="Armure"
          item={hero.armor}
          onUnequip={() => unequip.mutate({ heroId: hero.id, slot: 'armor' })}
          disabled={unequip.isPending}
        />
        <EquipRow
          slotIcon="💍"
          label="Bijou"
          item={hero.jewel}
          onUnequip={() => unequip.mutate({ heroId: hero.id, slot: 'jewel' })}
          disabled={unequip.isPending}
        />
        <EquipRow
          slotIcon="🔮"
          label="Relique"
          item={hero.relic}
          onUnequip={() => unequip.mutate({ heroId: hero.id, slot: 'relic' })}
          disabled={unequip.isPending}
        />
      </div>
    </div>
  );
}
