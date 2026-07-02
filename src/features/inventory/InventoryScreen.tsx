import { useMemo, useState, type ReactNode } from 'react';
import { useHeroes, type HeroView } from '@/features/heroes/useHeroes';
import {
  useItems,
  useEquip,
  useDeleteItems,
  useSetItemLock,
  type ItemRow,
} from '@/features/heroes/useItems';
import { useResources, resourceMeta } from '@/hooks/useResources';
import { useProfile } from '@/hooks/useProfile';
import { classMeta, rarityMeta } from '@/lib/gameUi';
import { PASSIVE_META } from '@shared/progression/jewelry';
import type { PassiveType } from '@shared/combat';

type Tab = 'equipment' | 'materials';
type TypeFilter = 'all' | 'weapon' | 'armor' | 'jewel' | 'relic';
type RarityFilter = 'all' | 'poor' | 'common' | 'uncommon' | 'advanced' | 'ultimate';
type Sort = 'recent' | 'rarity' | 'power';

const TYPE_META: Record<string, { icon: string; label: string }> = {
  weapon: { icon: '🗡️', label: 'Arme' },
  armor: { icon: '🛡️', label: 'Armure' },
  jewel: { icon: '💍', label: 'Bijou' },
  relic: { icon: '🔮', label: 'Relique' },
};
const TYPE_LABEL: Record<TypeFilter, string> = {
  all: 'Tout',
  weapon: 'Armes',
  armor: 'Armures',
  jewel: 'Bijoux',
  relic: 'Reliques',
};
const WEIGHT_META: Record<string, { label: string; color: string }> = {
  light: { label: 'Léger', color: '#5fd39b' },
  medium: { label: 'Moyen', color: '#e8b64a' },
  heavy: { label: 'Lourd', color: '#f0934a' },
};
const RARITY_ORDER: Record<string, number> = {
  ultimate: 5,
  advanced: 4,
  uncommon: 3,
  common: 2,
  poor: 1,
};

function itemPower(i: ItemRow): number {
  return i.atk_bonus + i.def_bonus + i.hp_bonus + (i.passive_value ?? 0) * 3;
}
function bonusLabel(item: ItemRow): string {
  // Bijou : passif en % au lieu de stats brutes.
  if (item.passive_type && item.passive_value > 0) {
    const meta = PASSIVE_META[item.passive_type as PassiveType];
    return meta
      ? `${meta.icon} ${meta.label} ${item.passive_value}%`
      : `${item.passive_type} ${item.passive_value}%`;
  }
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
  const del = useDeleteItems();
  const lock = useSetItemLock();

  const [type, setType] = useState<TypeFilter>('all');
  const [rarity, setRarity] = useState<RarityFilter>('all');
  const [sort, setSort] = useState<Sort>('recent');

  const heroList = useMemo(() => heroes ?? [], [heroes]);

  // item id → héros qui le porte.
  const equippedBy = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of heroList) {
      for (const it of [h.weapon, h.armor, h.jewel, h.relic]) {
        if (it) map.set(it.id, h.name);
      }
    }
    return map;
  }, [heroList]);

  const filtered = useMemo(() => {
    let list = (items ?? []).filter((i) => (type === 'all' ? true : i.item_type === type));
    if (rarity !== 'all') list = list.filter((i) => i.rarity === rarity);
    const sorted = [...list];
    if (sort === 'rarity')
      sorted.sort((a, b) => (RARITY_ORDER[b.rarity] ?? 0) - (RARITY_ORDER[a.rarity] ?? 0));
    else if (sort === 'power') sorted.sort((a, b) => itemPower(b) - itemPower(a));
    return sorted;
  }, [items, type, rarity, sort]);

  const deletableIds = filtered.filter((i) => !i.locked && !equippedBy.has(i.id)).map((i) => i.id);

  function compatibleHeroes(item: ItemRow): HeroView[] {
    // Reliques et bijoux sont universels (pas de poids).
    if (item.item_type === 'relic' || item.item_type === 'jewel') return heroList;
    return heroList.filter((h) => h.classWeight === item.weight);
  }

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
          {(['all', 'poor', 'common', 'uncommon', 'advanced', 'ultimate'] as RarityFilter[]).map(
            (r) => (
              <FilterChip
                key={r}
                active={rarity === r}
                onClick={() => setRarity(r)}
                label={r === 'all' ? 'Toutes' : rarityMeta(r).label}
              />
            ),
          )}
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
      {items && items.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="text-[var(--color-muted)]">{filtered.length} objet(s)</span>
          <button
            onClick={() => deletableIds.length > 0 && del.mutate(deletableIds)}
            disabled={deletableIds.length === 0 || del.isPending}
            className="btn px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
            style={{ background: 'linear-gradient(180deg, #f87171, #dc2626)' }}
            title="Supprime les objets affichés, sauf verrouillés et équipés"
          >
            🗑 Nettoyer ({deletableIds.length})
          </button>
          <span className="text-[10px] text-[var(--color-muted)]/70">
            (verrouillés 🔒 et équipés protégés)
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((item) => {
          const meta = rarityMeta(item.rarity);
          const tm = TYPE_META[item.item_type] ?? { icon: '❔', label: item.item_type };
          const wm = item.weight ? WEIGHT_META[item.weight] : null;
          const wearer = equippedBy.get(item.id);
          const compat = compatibleHeroes(item);
          return (
            <div
              key={item.id}
              className={`panel anim-slide p-3 ring-1 ${meta.ring}`}
              style={{ boxShadow: `0 8px 24px -18px ${meta.glow}` }}
            >
              <div className="flex items-start gap-2">
                <span className="text-xl">{tm.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-sm font-semibold ${meta.text}`}>{item.name}</div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--color-muted)]">
                    <span className="uppercase tracking-wide">{tm.label}</span>
                    {wm ? (
                      <span className="rounded px-1" style={{ color: wm.color }}>
                        {wm.label}
                      </span>
                    ) : (
                      <span className="text-[var(--color-arcane)]">Universel</span>
                    )}
                    <span className="uppercase tracking-wide">{meta.label}</span>
                    {item.tier > 1 && (
                      <span className="rounded bg-[var(--color-gold)]/15 px-1 text-[var(--color-gold-soft)]">
                        Tier {item.tier}
                      </span>
                    )}
                    {item.upgrade_level > 0 && (
                      <span className="rounded bg-[var(--color-arcane)]/20 px-1 text-[var(--color-ink)]">
                        +{item.upgrade_level}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => lock.mutate({ itemIds: [item.id], locked: !item.locked })}
                  disabled={lock.isPending}
                  className={`shrink-0 transition ${
                    item.locked
                      ? 'text-[var(--color-gold)]'
                      : 'text-[var(--color-muted)]/50 hover:text-[var(--color-ink)]'
                  }`}
                  title={item.locked ? 'Déverrouiller' : 'Verrouiller (protège de la suppression)'}
                >
                  {item.locked ? '🔒' : '🔓'}
                </button>
              </div>

              <div className="mt-2 text-xs text-[var(--color-ink)]/80">{bonusLabel(item)}</div>

              {wearer ? (
                <div className="mt-2 rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-300">
                  Équipé par {wearer}
                </div>
              ) : compat.length > 0 ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-[var(--color-muted)]">Équiper :</span>
                  {compat.map((h) => (
                    <button
                      key={h.id}
                      onClick={() =>
                        equip.mutate({
                          heroId: h.id,
                          itemId: item.id,
                          slot: item.item_type as 'weapon' | 'armor' | 'jewel' | 'relic',
                        })
                      }
                      disabled={equip.isPending}
                      title={`Équiper sur ${h.name}`}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-edge)] bg-black/30 text-sm transition hover:border-[var(--color-arcane)]"
                    >
                      {classMeta(h.classId).icon}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-2 text-[10px] text-[var(--color-muted)]/70">
                  Aucune classe compatible
                </div>
              )}
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
    ...Object.entries(resources ?? {})
      .filter(([, amt]) => amt > 0)
      .map(([key, amt]) => ({
        key,
        label: resourceMeta(key).label,
        icon: resourceMeta(key).icon,
        amount: amt,
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
