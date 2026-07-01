import { useItems, useEquip, type ItemRow } from './useItems';
import type { HeroView } from './useHeroes';
import { rarityMeta } from '@/lib/gameUi';

const TYPE_ICON: Record<string, string> = {
  weapon: '🗡️',
  armor: '🛡️',
  jewel: '💍',
  relic: '🔮',
};

const EQUIP_SLOTS = ['weapon', 'armor', 'jewel', 'relic'] as const;
type EquipSlot = (typeof EQUIP_SLOTS)[number];

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

export function InventoryPanel({ heroes }: { heroes: HeroView[] }) {
  const { data: items, isLoading } = useItems();
  const { equip } = useEquip();

  return (
    <div>
      <h3 className="font-display text-lg font-semibold text-[var(--color-ink)]">
        Inventaire{items && items.length > 0 && ` · ${items.length}`}
      </h3>

      {isLoading && <p className="mt-2 text-sm text-[var(--color-muted)]">Ouverture du coffre…</p>}
      {items && items.length === 0 && (
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Coffre vide. Termine des donjons et expéditions pour récupérer du butin.
        </p>
      )}

      {items && items.length > 0 && (
        <ul className="mt-3 space-y-2">
          {items.map((item) => {
            const rarity = rarityMeta(item.rarity);
            const equippable = (EQUIP_SLOTS as readonly string[]).includes(item.item_type);
            return (
              <li
                key={item.id}
                className={`anim-slide flex items-center justify-between gap-3 rounded-lg border border-[var(--color-edge)] bg-black/30 px-3 py-2 text-sm ring-1 ${rarity.ring}`}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="text-lg">{TYPE_ICON[item.item_type] ?? '❔'}</span>
                  <div className="min-w-0">
                    <div className={`truncate font-medium ${rarity.text}`}>
                      {item.name}
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
                        {rarity.label}
                      </span>
                    </div>
                    <div className="text-xs text-[var(--color-muted)]">{bonusLabel(item)}</div>
                  </div>
                </div>

                {equippable ? (
                  <select
                    defaultValue=""
                    disabled={equip.isPending}
                    onChange={(e) => {
                      const heroId = e.target.value;
                      if (!heroId) return;
                      equip.mutate({
                        heroId,
                        itemId: item.id,
                        slot: item.item_type as EquipSlot,
                      });
                      e.target.value = '';
                    }}
                    className="shrink-0 rounded-md border border-[var(--color-edge)] bg-[var(--color-panel)] px-2 py-1 text-xs text-[var(--color-ink)]"
                  >
                    <option value="">Équiper sur…</option>
                    {heroes.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="shrink-0 text-[10px] text-[var(--color-muted)]/70">
                    Non équipable
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {equip.isError && (
        <p className="mt-2 text-sm text-[var(--color-ember)]">
          Erreur : {equip.error instanceof Error ? equip.error.message : 'inconnue'}
        </p>
      )}
    </div>
  );
}
