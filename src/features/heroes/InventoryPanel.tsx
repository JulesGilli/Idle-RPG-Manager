import { useItems, useEquip, type ItemRow } from './useItems';
import type { HeroView } from './useHeroes';

const RARITY_COLOR: Record<string, string> = {
  common: 'text-neutral-200',
  rare: 'text-sky-300',
  epic: 'text-fuchsia-300',
};

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
      <h3 className="text-lg font-semibold">Inventaire</h3>
      {isLoading && <p className="mt-2 text-neutral-500">Chargement de l'inventaire…</p>}
      {items && items.length === 0 && (
        <p className="mt-2 text-sm text-neutral-500">
          Aucun objet. Termine des donjons pour récupérer du butin.
        </p>
      )}

      {items && items.length > 0 && (
        <ul className="mt-3 space-y-2">
          {items.map((item) => {
            const equippable = item.item_type === 'weapon' || item.item_type === 'armor';
            return (
              <li
                key={item.id}
                className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              >
                <div>
                  <span
                    className={`font-medium ${RARITY_COLOR[item.rarity] ?? 'text-neutral-200'}`}
                  >
                    {item.name}
                  </span>
                  <span className="ml-2 text-xs text-neutral-500">
                    {item.item_type} · {bonusLabel(item)}
                  </span>
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
                        slot: item.item_type as 'weapon' | 'armor',
                      });
                      e.target.value = '';
                    }}
                    className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
                  >
                    <option value="">Équiper sur…</option>
                    {heroes.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs text-neutral-600">Accessoire (MVP : non équipable)</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {equip.isError && (
        <p className="mt-2 text-sm text-red-400">
          Erreur : {equip.error instanceof Error ? equip.error.message : 'inconnue'}
        </p>
      )}
    </div>
  );
}
