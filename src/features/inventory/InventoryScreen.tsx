import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { HeroCard } from '@/components/HeroCard';
import { useHeroes, type HeroView } from '@/features/heroes/useHeroes';
import {
  useItems,
  useEquip,
  useDeleteItems,
  useSetItemLock,
  type ItemRow,
  type SalvageResult,
} from '@/features/heroes/useItems';
import { useResourcesByTier, resourceMeta } from '@/hooks/useResources';
import { useArc } from '@/features/arc/useArc';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { SyntyGlyph } from '@/components/synty/SyntyIcon';
import { UiIcon, ClassIcon, PassiveIcon, EquipmentIcon } from '@/components/synty/GameIcons';
import { STAT_GLYPH, type UiIconName } from '@/lib/synty';
import { useProfile } from '@/hooks/useProfile';
import { rarityMeta, rarityColor, WEIGHT_META } from '@/lib/gameUi';
import { PASSIVE_META } from '@shared/progression/jewelry';
import { canEquipWeight, type ItemWeight } from '@shared/progression/loot';
import { setById } from '@shared/progression/sets';
import { ZoneUpgradeStars } from '@/components/ItemStars';
import { EquipCompare, anchorOf, type AnchorRect } from '@/components/EquipCompare';
import { materialZone, materialSource } from '@/lib/itemZone';
import type { PassiveType } from '@shared/combat';

type Tab = 'heroes' | 'equipment' | 'materials';
type TypeFilter = 'all' | 'weapon' | 'armor' | 'jewel' | 'relic';
type RarityFilter = 'all' | 'poor' | 'common' | 'uncommon' | 'advanced' | 'ultimate';
type Sort = 'rarity' | 'zone' | 'recent';
type MatSort = 'category' | 'amount' | 'name';
// Tier = numéro d'arc (T1 = arc 1). 'all' = tous les arcs confondus.
type TierSel = number | 'all';

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
const RARITY_ORDER: Record<string, number> = {
  ultimate: 5,
  advanced: 4,
  uncommon: 3,
  common: 2,
  poor: 1,
};
const SORT_LABEL: Record<Sort, string> = {
  rarity: 'Rareté',
  zone: 'Tier / zone',
  recent: 'Récent',
};
const STAT_COLOR = { atk: '#fb7185', def: '#56b6f4', hp: '#5fd39b' } as const;

export function InventoryScreen() {
  const [tab, setTab] = useState<Tab>('heroes');
  const { currentArc, maxArc } = useArc();
  // Filtre de tier (arc) partagé entre Équipement et Matériaux.
  // Défaut = arc courant ; borné à [1, maxArc].
  const [tier, setTier] = useState<TierSel>(currentArc);
  return (
    <section className="anim-fade space-y-4 sm:space-y-5">
      <div>
        <h2 className="heading text-xl sm:text-2xl">Équipe</h2>
        <p className="text-sm text-[var(--color-muted)]">Tes héros, ton équipement et tes ressources.</p>
      </div>
      {/* Onglets : défilables horizontalement sur mobile plutôt que de déborder. */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        <TabButton active={tab === 'heroes'} onClick={() => setTab('heroes')} icon="squad" label="Héros" />
        <span data-tour="equip-hero">
          <TabButton
            active={tab === 'equipment'}
            onClick={() => setTab('equipment')}
            icon="attack"
            label="Équipement"
          />
        </span>
        <TabButton
          active={tab === 'materials'}
          onClick={() => setTab('materials')}
          icon="materials"
          label="Matériaux"
        />
      </div>
      {tab === 'heroes' ? (
        <HeroesTab />
      ) : tab === 'equipment' ? (
        <EquipmentTab tier={tier} setTier={setTier} maxArc={maxArc} />
      ) : (
        <MaterialsTab tier={tier} setTier={setTier} maxArc={maxArc} />
      )}
    </section>
  );
}

/** Onglet Héros : l'ex-écran Escouade (grille de héros + puissance totale). */
function HeroesTab() {
  const { data: heroes, isLoading, isError, error } = useHeroes();
  const totalPower = (heroes ?? []).reduce((sum, h) => sum + h.power, 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--color-muted)]">
          Recrute de nouveaux aventuriers à la{' '}
          <Link
            to="/tavern"
            className="inline-flex items-center gap-1 text-[var(--color-arcane)] hover:underline"
          >
            <UiIcon name="tavern" size={14} color="currentColor" />
            Taverne
          </Link>
          .
        </p>
        {heroes && heroes.length > 0 && (
          <div className="panel px-3 py-1.5 text-right">
            <span className="text-[10px] uppercase tracking-widest text-[var(--color-muted)]">
              Puissance
            </span>{' '}
            <span className="font-display text-lg font-bold text-[var(--color-gold)]">
              {totalPower}
            </span>
          </div>
        )}
      </div>

      {isLoading && <p className="text-[var(--color-muted)]">Invocation des héros…</p>}
      {isError && (
        <p className="text-[var(--color-ember)]">
          Erreur : {error instanceof Error ? error.message : 'inconnue'}
        </p>
      )}

      {heroes && heroes.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {heroes.map((hero) => (
            <HeroCard key={hero.id} hero={hero} />
          ))}
        </div>
      )}
    </div>
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

function EquipmentTab({
  tier,
  setTier,
  maxArc,
}: {
  tier: TierSel;
  setTier: (t: TierSel) => void;
  maxArc: number;
}) {
  const { data: items, isLoading } = useItems();
  const { data: heroes } = useHeroes();
  const { equip } = useEquip();
  const del = useDeleteItems();
  const [salvage, setSalvage] = useState<SalvageResult | null>(null);
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
    if (tier !== 'all') list = list.filter((i) => i.tier === tier);
    const sorted = [...list];
    if (sort === 'rarity')
      sorted.sort((a, b) => (RARITY_ORDER[b.rarity] ?? 0) - (RARITY_ORDER[a.rarity] ?? 0));
    // « Zone » = ordre de PUISSANCE réelle : l'arc prime sur la zone de matériau
    // (un T2 de zone 1 bat un T1 de zone 10), puis l'amélioration, puis la rareté.
    // Sans les départages, deux objets de même zone tombaient dans un ordre
    // arbitraire — c'est justement ce qu'on veut départager ici.
    if (sort === 'zone')
      sorted.sort(
        (a, b) =>
          b.tier - a.tier ||
          materialZone(b) - materialZone(a) ||
          b.upgrade_level - a.upgrade_level ||
          (RARITY_ORDER[b.rarity] ?? 0) - (RARITY_ORDER[a.rarity] ?? 0),
      );
    return sorted;
  }, [items, type, rarity, tier, sort]);

  const deletableIds = filtered.filter((i) => !i.locked && !equippedBy.has(i.id)).map((i) => i.id);

  function compatibleHeroes(item: ItemRow): HeroView[] {
    // Reliques, bijoux et pièces de set sont universels (pas de contrainte de poids).
    if (item.item_type === 'relic' || item.item_type === 'jewel' || item.set_id) return heroList;
    return heroList.filter((h) => canEquipWeight(h.classId, item.weight as ItemWeight | null));
  }

  return (
    <div className="space-y-4">
      <div className="panel space-y-2.5 p-3">
        <TierFilter tier={tier} setTier={setTier} maxArc={maxArc} />
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
                {...(r !== 'all' ? { dot: rarityColor(r) } : {})}
              />
            ),
          )}
        </FilterRow>
        <FilterRow label="Tri">
          {(['rarity', 'zone', 'recent'] as Sort[]).map((s) => (
            <FilterChip
              key={s}
              active={sort === s}
              onClick={() => setSort(s)}
              label={SORT_LABEL[s]}
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
            onClick={() =>
              deletableIds.length > 0 &&
              del.mutate(deletableIds, { onSuccess: (r) => setSalvage(r) })
            }
            disabled={deletableIds.length === 0 || del.isPending}
            className="btn px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
            style={{ background: '#dc2626' }}
            title="Recycle les objets affichés (sauf verrouillés et équipés) et rend la moitié des matériaux de leur craft"
          >
            Recycler ({deletableIds.length})
          </button>
          {/* Retour explicite : sans ça, le joueur ne sait pas ce qu'il a récupéré. */}
          {salvage && salvage.deleted > 0 && (
            <span className="chip inline-flex flex-wrap items-center gap-1.5 bg-[var(--color-gold)]/10 text-[11px] text-[var(--color-gold-soft)]">
              {salvage.deleted} recyclé{salvage.deleted > 1 ? 's' : ''}
              {Object.keys(salvage.refunded).length > 0 ? ' →' : ' · aucun matériau rendu'}
              {Object.entries(salvage.refunded).map(([key, qty]) => (
                <span key={key} className="inline-flex items-center gap-1">
                  <ResourceIcon resKey={key} /> +{qty} {resourceMeta(key).label}
                </span>
              ))}
            </span>
          )}
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
            onDelete={() => del.mutate([item.id], { onSuccess: (r) => setSalvage(r) })}
            deletePending={del.isPending}
          />
        ))}
      </div>

      {items && filtered.length === 0 && (
        <p className="text-sm text-[var(--color-muted)]">Aucun objet ne correspond aux filtres.</p>
      )}
    </div>
  );
}

/** Icône poubelle (SVG inline — pas d'asset Synty dédié). */
function TrashIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
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
  onDelete,
  deletePending,
}: {
  item: ItemRow;
  wearer: string | undefined;
  compat: HeroView[];
  onEquip: (heroId: string) => void;
  equipPending: boolean;
  onToggleLock: () => void;
  lockPending: boolean;
  onDelete: () => void;
  deletePending: boolean;
}) {
  const meta = rarityMeta(item.rarity);
  const tm = TYPE_META[item.item_type] ?? { label: item.item_type };
  const wm = item.weight ? WEIGHT_META[item.weight] : null;
  const color = rarityColor(item.rarity);
  // Un BIJOU n'a que son passif ; une arme peut en porter un EN PLUS de ses
  // stats (Arc → crit, Dague → esquive). Tester `passive_type` seul masquerait
  // l'ATK de ces armes.
  const isJewel = item.item_type === 'jewel';
  const passive = item.passive_type && item.passive_value > 0 ? item.passive_type : null;
  const [confirming, setConfirming] = useState(false);
  // Héros survolé dans la rangée « Équiper » → comparatif avec ce qu'il porte déjà.
  const [hovered, setHovered] = useState<{ hero: HeroView; anchor: AnchorRect } | null>(null);
  const slot = item.item_type as 'weapon' | 'armor' | 'jewel' | 'relic';

  return (
    <div className="panel relative flex flex-col gap-3 overflow-hidden p-3.5">
      {/* En-tête : tuile + nom + verrou. La rareté n'est plus un cadre coloré :
          juste un MOT teinté sur le dégradé gris → rouge-doré. */}
      <div className="flex items-start gap-3">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${color}1f` }}
        >
          <EquipmentIcon item={item} size={44} color={color} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-sm font-bold text-[var(--color-ink)]">
            {item.name}
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--color-muted)]">
            {tm.label} ·{' '}
            <span className="font-semibold" style={{ color }}>
              {meta.label}
            </span>
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
        {!item.locked && !wearer && (
          <button
            onClick={() => setConfirming(true)}
            disabled={deletePending}
            className="shrink-0 text-[var(--color-muted)]/40 transition hover:text-[#f87171] disabled:opacity-40"
            title="Supprimer cet objet"
            aria-label="Supprimer cet objet"
          >
            <TrashIcon size={16} />
          </button>
        )}
      </div>

      {/* Confirmation intégrée (recouvre la carte) — évite la boîte native. */}
      {confirming && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2.5 bg-[var(--color-panel)]/95 p-4 text-center backdrop-blur-sm">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#ef4444]/15 text-[#f87171]">
            <TrashIcon size={18} />
          </span>
          <div className="text-sm font-semibold text-[var(--color-ink)]">
            Supprimer «&nbsp;{item.name}&nbsp;» ?
          </div>
          <div className="text-[11px] text-[var(--color-muted)]">Cette action est définitive.</div>
          <div className="mt-1 flex gap-2">
            <button
              onClick={() => {
                onDelete();
                setConfirming(false);
              }}
              disabled={deletePending}
              className="rounded-md bg-[#ef4444] px-3 py-1 text-xs font-bold text-white transition hover:bg-[#dc2626] disabled:opacity-50"
            >
              {deletePending ? '…' : 'Supprimer'}
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="rounded-md border border-[var(--color-edge)] px-3 py-1 text-xs font-medium text-[var(--color-muted)] transition hover:text-[var(--color-ink)]"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Étoiles : zone du matériau (remplissage) + amélioration (contour doré).
          Remplace les badges T{tier} / +{upgrade} pour désencombrer la carte. */}
      <div className="flex flex-wrap items-center gap-2 text-[10px]">
        <ZoneUpgradeStars zone={materialZone(item)} upgrade={item.upgrade_level} />
        <span
          className="rounded-md bg-white/[0.05] px-1.5 py-0.5 font-semibold text-[var(--color-muted)]"
          title={`Tier de craft ${item.tier} — objet de l'Arc ${item.tier}`}
        >
          T{item.tier}
        </span>
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
            {/* Stat secondaire du modèle, EN PLUS des stats brutes. */}
            {passive && <PassiveChip type={passive as PassiveType} value={item.passive_value} />}
            {item.atk_bonus === 0 && item.def_bonus === 0 && item.hp_bonus === 0 && !passive && (
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
                onMouseEnter={(e) => setHovered({ hero: h, anchor: anchorOf(e.currentTarget) })}
                onMouseLeave={() => setHovered(null)}
                // Le clavier doit donner le même comparatif que la souris.
                onFocus={(e) => setHovered({ hero: h, anchor: anchorOf(e.currentTarget) })}
                onBlur={() => setHovered(null)}
                title={`Équiper sur ${h.name}`}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-edge)] bg-[var(--color-panel-2)] transition hover:border-[var(--color-arcane)] hover:bg-[var(--color-arcane)]/15"
              >
                <ClassIcon classId={h.classId} size={18} />
              </button>
            ))}
            {hovered && (
              <EquipCompare
                candidate={item}
                current={hovered.hero[slot] ?? null}
                heroName={hovered.hero.name}
                anchor={hovered.anchor}
              />
            )}
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

function MaterialsTab({
  tier,
  setTier,
  maxArc,
}: {
  tier: TierSel;
  setTier: (t: TierSel) => void;
  maxArc: number;
}) {
  const byTier = useResourcesByTier();
  const { data: profile } = useProfile();
  const [sort, setSort] = useState<MatSort>('category');

  // Tier précis → ressources de cet arc ; « Tous » → cumul de tous les arcs.
  const resources: Record<string, number> =
    tier === 'all'
      ? Object.values(byTier).reduce<Record<string, number>>((acc, byRes) => {
          for (const [k, v] of Object.entries(byRes)) acc[k] = (acc[k] ?? 0) + v;
          return acc;
        }, {})
      : (byTier[tier] ?? {});

  const mats = Object.entries(resources)
    .filter(([, amt]) => amt > 0)
    .map(([key, amt]) => ({
      key,
      label: resourceMeta(key).label,
      amount: amt,
      source: materialSource(key),
    }));

  if (sort === 'amount') mats.sort((a, b) => b.amount - a.amount);
  else if (sort === 'name') mats.sort((a, b) => a.label.localeCompare(b.label));
  else
    mats.sort(
      (a, b) => matCategory(a.key) - matCategory(b.key) || a.label.localeCompare(b.label),
    );

  // L'or reste toujours épinglé en tête, hors tri.
  const entries = [
    { key: 'gold', label: 'Or', amount: profile?.gold ?? 0, source: null },
    ...mats,
  ];

  return (
    <div className="space-y-4">
      {maxArc > 1 && (
        <div className="panel space-y-2.5 p-3">
          <TierFilter tier={tier} setTier={setTier} maxArc={maxArc} />
        </div>
      )}
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
            {e.source && (
              <div
                className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--color-muted)]/70"
                title={`Matériau de la zone ${e.source.zone} — Arc ${e.source.tier}`}
              >
                Zone {e.source.zone} · T{e.source.tier}
              </div>
            )}
          </div>
        </div>
        ))}
      </div>
    </div>
  );
}

/** Segmented control T1…T{maxArc} (+ « Tous »). Masqué tant qu'un seul arc existe. */
function TierFilter({
  tier,
  setTier,
  maxArc,
}: {
  tier: TierSel;
  setTier: (t: TierSel) => void;
  maxArc: number;
}) {
  if (maxArc <= 1) return null;
  const tiers = Array.from({ length: maxArc }, (_, i) => i + 1);
  return (
    <FilterRow label="Arc">
      {tiers.map((t) => (
        <FilterChip key={t} active={tier === t} onClick={() => setTier(t)} label={`T${t}`} />
      ))}
      <FilterChip active={tier === 'all'} onClick={() => setTier('all')} label="Tous" />
    </FilterRow>
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
