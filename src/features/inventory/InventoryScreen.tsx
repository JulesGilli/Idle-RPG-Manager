import { useMemo, useState, type ReactNode } from 'react';
import { useHeroes } from '@/features/heroes/useHeroes';
import { useItems, useEquip, type ItemRow } from '@/features/heroes/useItems';
import { useResources, RESOURCE_META } from '@/hooks/useResources';
import { useProfile } from '@/hooks/useProfile';
import { rarityMeta } from '@/lib/gameUi';

type Tab = 'equipment' | 'materials';
type TypeFilter = 'all' | 'weapon' | 'armor' | 'jewel' | 'relic';
type RarityFilter = 'all' | 'common' | 'rare' | 'epic';
type Sort = 'recent' | 'rarity' | 'power';

const TYPE_ICON: Record<string, string> = { weapon: '🗡️', armor: '🛡️', jewel: '💍', relic: '🔮' };
const TYPE_LABEL: Record<TypeFilter, string> = {
  all: 'Tout',
  weapon: 'Armes',
  armor: 'Armures',
  jewel: 'Bijoux',
  relic: 'Reliques',
};
const RARITY_ORDER: Record<string, number> = { epic: 3, rare: 2, common: 1 };

function itemPower(i: ItemRow): number {
  return i.atk_bonus + i.def_bonus + i.hp_bonus;
}

function bonusLabel(item: ItemRow): string {
  return (
    [
      item.atk_bonus ? `+${item.atk_bonus} ATK` : null,
      item.def_bonus ? `+${item.def_bonus} DEF` : null,
      item.hp_bonus ? `+${item.hp_bonus} PV` : null,
    ]
      .filter(Boolean)
      .join(' · ') || '—'
  );
}

export function InventoryScreen() {
  const [tab, setTab] = useState<Tab>('equipment');

  return (
    <section className="anim-fade space-y-5">
      <div>
        <h2 className="heading text-2xl">Sac</h2>
        <p className="text-sm text-[var(--color-muted)]">Ton butin et tes ressources.</p>
      </div>

      <div className="flex gap-2">
        <TabButton
          active={tab === 'equipment'}
          onClick={() => setTab('equipment')}
          label="⚔️ Équipement"
        />
        <TabButton
          active={tab === 'materials'}
          onClick={() => setTab('materials')}
          label="📦 Matériaux"
        />
      </div>

      {tab === 'equipment' ? <EquipmentTab /> : <MaterialsTab />}
    </section>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
        active
          ? 'bg-[var(--color-arcane)]/15 text-white shadow-[inset_0_0_0_1px_rgba(124,108,255,0.4)]'
          : 'text-[var(--color-muted)] hover:bg-white/5'
      }`}
    >
      {label}
    </button>
  );
}

function EquipmentTab() {
  const { data: items, isLoading } = useItems();
  const { data: heroes } = useHeroes();
  const { equip } = useEquip();

  const [type, setType] = useState<TypeFilter>('all');
  const [rarity, setRarity] = useState<RarityFilter>('all');
  const [sort, setSort] = useState<Sort>('recent');

  const filtered = useMemo(() => {
    let list = (items ?? []).filter((i) => (type === 'all' ? true : i.item_type === type));
    if (rarity !== 'all') list = list.filter((i) => i.rarity === rarity);
    const sorted = [...list];
    if (sort === 'rarity')
      sorted.sort((a, b) => (RARITY_ORDER[b.rarity] ?? 0) - (RARITY_ORDER[a.rarity] ?? 0));
    else if (sort === 'power') sorted.sort((a, b) => itemPower(b) - itemPower(a));
    return sorted;
  }, [items, type, rarity, sort]);

  return (
    <div className="space-y-4">
      <div className="panel space-y-3 p-3">
        <FilterRow label="Type">
          {(Object.keys(TYPE_LABEL) as TypeFilter[]).map((t) => (
            <FilterChip
              key={t}
              active={type === t}
              onClick={() => setType(t)}
              label={TYPE_LABEL[t]}
            />
          ))}
        </FilterRow>
        <FilterRow label="Rareté">
          {(['all', 'common', 'rare', 'epic'] as RarityFilter[]).map((r) => (
            <FilterChip
              key={r}
              active={rarity === r}
              onClick={() => setRarity(r)}
              label={r === 'all' ? 'Toutes' : rarityMeta(r).label}
            />
          ))}
        </FilterRow>
        <FilterRow label="Tri">
          {(['recent', 'rarity', 'power'] as Sort[]).map((s) => (
            <FilterChip
              key={s}
              active={sort === s}
              onClick={() => setSort(s)}
              label={s === 'recent' ? 'Récent' : s === 'rarity' ? 'Rareté' : 'Puissance'}
            />
          ))}
        </FilterRow>
      </div>

      {isLoading && <p className="text-[var(--color-muted)]">Ouverture du coffre…</p>}
      {items && (
        <div className="mb-1 text-xs text-[var(--color-muted)]">{filtered.length} objet(s)</div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((item) => {
          const meta = rarityMeta(item.rarity);
          return (
            <div
              key={item.id}
              className={`panel anim-slide p-3 ring-1 ${meta.ring}`}
              style={{ boxShadow: `0 0 0 0 transparent, 0 8px 24px -18px ${meta.glow}` }}
            >
              <div className="flex items-start gap-2">
                <span className="text-xl">{TYPE_ICON[item.item_type] ?? '❔'}</span>
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-sm font-semibold ${meta.text}`}>{item.name}</div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
                    {meta.label}
                  </div>
                </div>
              </div>
              <div className="mt-2 text-xs text-[var(--color-ink)]/80">{bonusLabel(item)}</div>
              <select
                defaultValue=""
                disabled={equip.isPending}
                onChange={(e) => {
                  const heroId = e.target.value;
                  if (!heroId) return;
                  equip.mutate({
                    heroId,
                    itemId: item.id,
                    slot: item.item_type as 'weapon' | 'armor' | 'jewel' | 'relic',
                  });
                  e.target.value = '';
                }}
                className="mt-2 w-full rounded-md border border-[var(--color-edge)] bg-black/30 px-2 py-1 text-xs text-[var(--color-ink)]"
              >
                <option value="">Équiper sur…</option>
                {(heroes ?? []).map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      {items && filtered.length === 0 && (
        <p className="text-sm text-[var(--color-muted)]">Aucun objet ne correspond aux filtres.</p>
      )}
    </div>
  );
}

function MaterialsTab() {
  const { data: resources } = useResources();
  const { data: profile } = useProfile();

  const entries = [
    { key: 'gold', label: 'Or', icon: '💰', amount: profile?.gold ?? 0 },
    ...Object.keys(RESOURCE_META).map((k) => ({
      key: k,
      label: RESOURCE_META[k]!.label,
      icon: RESOURCE_META[k]!.icon,
      amount: resources?.[k] ?? 0,
    })),
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {entries.map((e) => (
        <div key={e.key} className="panel flex items-center gap-3 p-4">
          <span className="text-2xl">{e.icon}</span>
          <div>
            <div className="font-display text-xl font-bold tabular-nums text-[var(--color-ink)]">
              {e.amount}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-[var(--color-muted)]">
              {e.label}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 w-14 shrink-0 text-[10px] uppercase tracking-widest text-[var(--color-muted)]">
        {label}
      </span>
      {children}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
        active
          ? 'bg-[var(--color-arcane)]/20 text-white shadow-[inset_0_0_0_1px_rgba(124,108,255,0.4)]'
          : 'border border-[var(--color-edge)] text-[var(--color-muted)] hover:text-[var(--color-ink)]'
      }`}
    >
      {label}
    </button>
  );
}
