import { useState } from 'react';
import { useResources, resourceMeta } from '@/hooks/useResources';
import { useProfile } from '@/hooks/useProfile';
import { rarityMeta } from '@/lib/gameUi';
import { SETS, setPieceRecipe, type SetPieceRecipe } from '@shared/progression/sets';
import { useForge, type CraftedItem } from './useForge';
import { Overlay } from '@/components/Overlay';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { UiIcon, ItemTypeIcon } from '@/components/synty/GameIcons';

function setBonusLine(b: { atk: number; def: number; hp: number }): string {
  return [b.atk ? `+${b.atk} ATK` : null, b.def ? `+${b.def} DEF` : null, b.hp ? `+${b.hp} PV` : null]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Fenêtre de craft d'une pièce de set (identique dans tous les ateliers). Recette
 * fixe (zone + expédition + boss + donjon) → pas de choix de matériaux, mais le
 * même parcours « clique l'item → fenêtre de craft » que les autres objets.
 */
export function SetCraftModal({ piece, onClose }: { piece: SetPieceRecipe; onClose: () => void }) {
  const { data: resources } = useResources();
  const { data: profile } = useProfile();
  const { craftSet } = useForge();
  const [crafted, setCrafted] = useState<CraftedItem | null>(null);

  const gold = profile?.gold ?? 0;
  const res = resources ?? {};
  const recipe = setPieceRecipe(piece);
  const set = SETS.find((s) => s.id === piece.setId);
  const ok = gold >= recipe.gold && recipe.materials.every((m) => (res[m.key] ?? 0) >= m.qty);

  return (
    <Overlay
      title={
        <span className="flex items-center gap-2">
          <ItemTypeIcon type={piece.slot} size={20} color="var(--color-muted)" /> {piece.label}
        </span>
      }
      onClose={onClose}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="chip bg-[var(--color-arcane)]/15 font-semibold text-[var(--color-arcane)]">
            {set?.name ?? 'Set'}
          </span>
          <span className="chip bg-[var(--color-gold)]/15 font-semibold text-[var(--color-gold-soft)]">
            T1
          </span>
          <span className="chip bg-white/5 text-[var(--color-muted)]">Universel</span>
        </div>

        <div className="flex flex-wrap gap-3 text-sm text-[var(--color-ink)]/85">
          {piece.atk > 0 && <span>+{piece.atk} ATK</span>}
          {piece.def > 0 && <span>+{piece.def} DEF</span>}
          {piece.hp > 0 && <span>+{piece.hp} PV</span>}
        </div>

        {set && (
          <div className="rounded-lg border border-[var(--color-edge)] bg-black/20 p-2.5 text-xs text-[var(--color-muted)]">
            Bonus d'ensemble — 2 pièces{' '}
            <span className="text-[var(--color-gold-soft)]">{setBonusLine(set.bonus2)}</span> · 4 pièces{' '}
            <span className="text-[var(--color-gold-soft)]">{setBonusLine(set.bonus4)}</span>
          </div>
        )}

        <div>
          <div className="mb-1 text-xs font-medium text-[var(--color-muted)]">
            Matériaux (recette fixe : zone + expédition + boss + donjon)
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={gold >= recipe.gold ? 'text-[var(--color-gold-soft)]' : 'text-[var(--color-ember)]'}>
              <UiIcon name="gold" size={13} /> {recipe.gold}
            </span>
            {recipe.materials.map((m) => {
              const have = res[m.key] ?? 0;
              return (
                <span
                  key={m.key}
                  className={`inline-flex items-center gap-1 ${
                    have >= m.qty ? 'text-[var(--color-ink)]/80' : 'text-[var(--color-ember)]'
                  }`}
                >
                  <ResourceIcon resKey={m.key} /> {resourceMeta(m.key).label} : {have}/{m.qty}
                </span>
              );
            })}
          </div>
        </div>

        {craftSet.isError && (
          <p className="text-sm text-[var(--color-ember)]">
            {craftSet.error instanceof Error ? craftSet.error.message : 'Erreur'}
          </p>
        )}

        <button
          onClick={() => {
            setCrafted(null);
            craftSet.mutate({ pieceId: piece.id }, { onSuccess: (r) => setCrafted(r.item) });
          }}
          disabled={!ok || craftSet.isPending}
          className="btn btn-primary w-full text-sm"
        >
          {craftSet.isPending ? 'Forge…' : `Forger : ${piece.label}`}
        </button>

        {crafted && (
          <div className="panel anim-pop flex items-center justify-between gap-3 p-3 text-sm">
            <span className={`font-display font-semibold ${rarityMeta(crafted.rarity).text}`}>
              {crafted.name}
            </span>
            <span className="text-xs text-[var(--color-muted)]">
              {[
                crafted.atk_bonus ? `+${crafted.atk_bonus} ATK` : null,
                crafted.def_bonus ? `+${crafted.def_bonus} DEF` : null,
                crafted.hp_bonus ? `+${crafted.hp_bonus} PV` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
        )}
      </div>
    </Overlay>
  );
}
