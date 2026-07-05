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
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { SyntyGlyph } from '@/components/synty/SyntyIcon';
import { UiIcon, ClassIcon, ItemTypeIcon, PassiveIcon } from '@/components/synty/GameIcons';
import { STAT_GLYPH, rarityHex, type UiIconName } from '@/lib/synty';
import { useProfile } from '@/hooks/useProfile';
import { rarityMeta } from '@/lib/gameUi';
import { PASSIVE_META } from '@shared/progression/jewelry';
import { setById } from '@shared/progression/sets';
import type { PassiveType } from '@shared/combat';

type Tab = 'equipment' | 'materials';
type TypeFilter = 'all' | 'weapon' | 'armor' | 'jewel' | 'relic';
type RarityFilter = 'all' | 'poor' | 'common' | 'uncommon' | 'advanced' | 'ultimate';
type Sort = 'rarity' | 'recent';
type MatSort = 'category' | 'amount' | 'name';

// Regroupement des matériaux pour le tri « Catégorie » (ordre d'affichage).
const BOSS_COMPONENTS = new Set([
  'coeur_sylve', 'givre_pur', 'oeil_sphinx', 'coeur_hydre', 'braise_eternelle',
  'fragment_titan', 'encre_kraken', 'foudre_condensee', 'coeur_ombre', 'essence_astrale',
]);
const DUNGEON_LOOT = new Set(['ossement', 'fragment_relique', 'sceau_catacombe']);
function matCategory(key: string): number {
  if (key.startsWith('gemme_')) return 3;
  if (DUNGEON_LOOT.has(key)) return 4;
  if (BOSS_COMPONENTS.has(key)) return 2;
  return 1; // matériaux de zone (+ legacy)
}

const TYPE_META: Record<string, { label: string }> = {
  weapon: { label: 'Arme' },
  armor: { label: 'Armure' },
  jewel: { label: 'Bijou' },
  relic: { label: 'Relique' },
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
const STAT_COLOR = { atk: '#fb7185', def: '#56b6f4', hp: '#5fd39b' } as const;

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
          icon="attack"
          label="Équipement"
        />
        <TabButton
          active={tab === 'materials'}
          onClick={() => setTab('materials')}
          icon="materials"
          label="Matériaux"
        />
      </div>
      {tab === 'equipment' ? <EquipmentTab /> : <MaterialsTab />}
    </section>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: UiIconName;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-semibold transition ${
        active
          ? 'border-[var(--color-arcane)] bg-[var(--color-arcane)]/15 text-white'
          : 'border-transparent text-[var(--color-muted)] hover:bg-white/5 hover:text-[var(--color-ink)]'
      }`}
    >
      <UiIcon name={icon} size={15} color="currentColor" />
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
  const [sort, setSort] = useState<Sort>('rarity');

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
    return sorted;
  }, [items, type, rarity, sort]);

  const deletableIds = filtered.filter((i) => !i.locked && !equippedBy.has(i.id)).map((i) => i.id);

  function compatibleHeroes(item: ItemRow): HeroView[] {
    // Reliques, bijoux et pièces de set sont universels (pas de contrainte de poids).
    if (item.item_type === 'relic' || item.item_type === 'jewel' || item.set_id) return heroList;
    return heroList.filter((h) => h.classWeight === item.weight);
  }

  return (
    <div className="space-y-4">
      <div className="panel space-y-2.5 p-3">
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
                {...(r !== 'all' ? { dot: rarityHex(r) } : {})}
              />
            ),
          )}
        </FilterRow>
        <FilterRow label="Tri">
          {(['rarity', 'recent'] as Sort[]).map((s) => (
            <FilterChip
              key={s}
              active={sort === s}
              onClick={() => setSort(s)}
              label={s === 'rarity' ? 'Rareté' : 'Récent'}
            />
          ))}
        </FilterRow>
      </div>

      {isLoading && <p className="text-[var(--color-muted)]">Ouverture du coffre…</p>}
      {items && items.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="font-medium text-[var(--color-muted)]">
            {filtered.length} objet{filtered.length > 1 ? 's' : ''}
          </span>
          <button
            onClick={() => deletableIds.length > 0 && del.mutate(deletableIds)}
            disabled={deletableIds.length === 0 || del.isPending}
            className="btn px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
            style={{ background: '#dc2626' }}
            title="Supprime les objets affichés, sauf verrouillés et équipés"
          >
            Nettoyer ({deletableIds.length})
          </button>
          <span className="inline-flex items-center gap-1 text-[10px] text-[var(--color-muted)]/70">
            (verrouillés <UiIcon name="lock" size={11} color="currentColor" /> et équipés protégés)
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {filtered.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            wearer={equippedBy.get(item.id)}
            compat={compatibleHeroes(item)}
            onEquip={(heroId) =>
              equip.mutate({
                heroId,
                itemId: item.id,
                slot: item.item_type as 'weapon' | 'armor' | 'jewel' | 'relic',
              })
            }
            equipPending={equip.isPending}
            onToggleLock={() => lock.mutate({ itemIds: [item.id], locked: !item.locked })}
            lockPending={lock.isPending}
          />
        ))}
      </div>

      {items && filtered.length === 0 && (
        <p className="text-sm text-[var(--color-muted)]">Aucun objet ne correspond aux filtres.</p>
      )}
    </div>
  );
}

function ItemCard({
  item,
  wearer,
  compat,
  onEquip,
  equipPending,
  onToggleLock,
  lockPending,
}: {
  item: ItemRow;
  wearer: string | undefined;
  compat: HeroView[];
  onEquip: (heroId: string) => void;
  equipPending: boolean;
  onToggleLock: () => void;
  lockPending: boolean;
}) {
  const meta = rarityMeta(item.rarity);
  const tm = TYPE_META[item.item_type] ?? { label: item.item_type };
  const wm = item.weight ? WEIGHT_META[item.weight] : null;
  const color = rarityHex(item.rarity);
  const isJewel = Boolean(item.passive_type && item.passive_value > 0);

  return (
    <div
      className="panel relative flex flex-col gap-3 overflow-hidden p-3.5 pl-4"
      style={{ borderColor: `${color}66` }}
    >
      {/* Liseré de rareté à plat */}
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: color }} />

      {/* En-tête : tuile + nom + verrou */}
      <div className="flex items-start gap-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${color}1f` }}
        >
          <ItemTypeIcon type={item.item_type} size={26} color={color} />
        </div>
        <div className="min-w-0 flex-1">
          <div className={`truncate font-display text-sm font-bold ${meta.text}`}>{item.name}</div>
          <div className="mt-0.5 text-[11px] text-[var(--color-muted)]">
            {tm.label} · {meta.label}
          </div>
        </div>
        <button
          onClick={onToggleLock}
          disabled={lockPending}
          className={`shrink-0 transition ${
            item.locked
              ? 'text-[var(--color-gold)]'
              : 'text-[var(--color-muted)]/40 hover:text-[var(--color-ink)]'
          }`}
          title={item.locked ? 'Déverrouiller' : 'Verrouiller (protège de la suppression)'}
        >
          <UiIcon name={item.locked ? 'lock' : 'key'} size={16} color="currentColor" />
        </button>
      </div>

      {/* Badges : poids / tier / upgrade */}
      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
        {wm ? (
          <span
            className="rounded-md px-1.5 py-0.5 font-semibold"
            style={{ backgroundColor: `${wm.color}1f`, color: wm.color }}
          >
            {wm.label}
          </span>
        ) : (
          <span className="rounded-md bg-[var(--color-arcane)]/15 px-1.5 py-0.5 font-semibold text-[var(--color-arcane)]">
            Universel
          </span>
        )}
        <span className="rounded-md bg-[var(--color-gold)]/15 px-1.5 py-0.5 font-semibold text-[var(--color-gold-soft)]">
          T{item.tier}
        </span>
        {item.upgrade_level > 0 && (
          <span className="rounded-md bg-[var(--color-arcane)]/20 px-1.5 py-0.5 font-semibold text-[var(--color-ink)]">
            +{item.upgrade_level}
          </span>
        )}
        {item.set_id && (
          <span className="rounded-md bg-[var(--color-gold)]/15 px-1.5 py-0.5 font-semibold text-[var(--color-gold-soft)]">
            {setById(item.set_id)?.name ?? 'Set'}
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-1.5">
        {isJewel ? (
          <PassiveChip type={item.passive_type as PassiveType} value={item.passive_value} />
        ) : (
          <>
            {item.atk_bonus > 0 && (
              <StatChip glyph={STAT_GLYPH.atk} color={STAT_COLOR.atk} label={`+${item.atk_bonus}`} name="ATK" />
            )}
            {item.def_bonus > 0 && (
              <StatChip glyph={STAT_GLYPH.def} color={STAT_COLOR.def} label={`+${item.def_bonus}`} name="DEF" />
            )}
            {item.hp_bonus > 0 && (
              <StatChip glyph={STAT_GLYPH.hp} color={STAT_COLOR.hp} label={`+${item.hp_bonus}`} name="PV" />
            )}
            {item.atk_bonus === 0 && item.def_bonus === 0 && item.hp_bonus === 0 && (
              <span className="text-xs text-[var(--color-muted)]/70">Aucun bonus</span>
            )}
          </>
        )}
      </div>

      {/* Équipement */}
      <div className="mt-auto border-t border-[var(--color-edge)] pt-3">
        {wearer ? (
          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Équipé par {wearer}
          </div>
        ) : compat.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-[var(--color-muted)]">Équiper :</span>
            {compat.map((h) => (
              <button
                key={h.id}
                onClick={() => onEquip(h.id)}
                disabled={equipPending}
                title={`Équiper sur ${h.name}`}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-edge)] bg-[var(--color-panel-2)] transition hover:border-[var(--color-arcane)] hover:bg-[var(--color-arcane)]/15"
              >
                <ClassIcon classId={h.classId} size={18} />
              </button>
            ))}
          </div>
        ) : (
          <div className="text-[11px] text-[var(--color-muted)]/70">Aucune classe compatible</div>
        )}
      </div>
    </div>
  );
}

function StatChip({
  glyph,
  color,
  label,
  name,
}: {
  glyph: string;
  color: string;
  label: string;
  name: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border border-[var(--color-edge)] bg-white/[0.03] px-2 py-1 text-xs font-semibold text-[var(--color-ink)]"
      title={name}
    >
      <SyntyGlyph src={glyph} size={13} color={color} />
      {label}
    </span>
  );
}

function PassiveChip({ type, value }: { type: PassiveType; value: number }) {
  const meta = PASSIVE_META[type];
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-[var(--color-arcane)]/40 bg-[var(--color-arcane)]/10 px-2 py-1 text-xs font-semibold text-[var(--color-ink)]">
      <PassiveIcon passive={type} size={13} />
      {meta?.label ?? type} <span className="text-[var(--color-arcane)]">+{value}%</span>
    </span>
  );
}

function MaterialsTab() {
  const { data: resources } = useResources();
  const { data: profile } = useProfile();
  const [sort, setSort] = useState<MatSort>('category');

  const mats = Object.entries(resources ?? {})
    .filter(([, amt]) => amt > 0)
    .map(([key, amt]) => ({
      key,
      label: resourceMeta(key).label,
      amount: amt,
    }));

  if (sort === 'amount') mats.sort((a, b) => b.amount - a.amount);
  else if (sort === 'name') mats.sort((a, b) => a.label.localeCompare(b.label));
  else
    mats.sort(
      (a, b) => matCategory(a.key) - matCategory(b.key) || a.label.localeCompare(b.label),
    );

  // L'or reste toujours épinglé en tête, hors tri.
  const entries = [{ key: 'gold', label: 'Or', amount: profile?.gold ?? 0 }, ...mats];

  return (
    <div className="space-y-4">
      <FilterRow label="Tri">
        {(['category', 'amount', 'name'] as MatSort[]).map((s) => (
          <FilterChip
            key={s}
            active={sort === s}
            onClick={() => setSort(s)}
            label={s === 'category' ? 'Catégorie' : s === 'amount' ? 'Quantité' : 'Nom'}
          />
        ))}
      </FilterRow>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {entries.map((e) => (
        <div key={e.key} className="panel flex items-center gap-3 p-4">
          {e.key === 'gold' ? (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--color-gold)]/15">
              <UiIcon name="gold" size={26} />
            </span>
          ) : (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/[0.04]">
              <ResourceIcon resKey={e.key} size={28} />
            </span>
          )}
          <div className="min-w-0">
            <div className="font-display text-xl font-bold tabular-nums text-[var(--color-ink)]">
              {e.amount}
            </div>
            <div className="truncate text-[10px] uppercase tracking-widest text-[var(--color-muted)]">
              {e.label}
            </div>
          </div>
        </div>
        ))}
      </div>
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
  dot,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  dot?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
        active
          ? 'border-[var(--color-arcane)] bg-[var(--color-arcane)]/20 text-white'
          : 'border-[var(--color-edge)] text-[var(--color-muted)] hover:border-[var(--color-edge-strong)] hover:text-[var(--color-ink)]'
      }`}
    >
      {dot && <span className="h-2 w-2 rounded-full" style={{ background: dot }} />}
      {label}
    </button>
  );
}
