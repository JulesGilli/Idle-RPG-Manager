import { useState } from 'react';
import { useResources, resourceMeta } from '@/hooks/useResources';
import { useProfile } from '@/hooks/useProfile';
import { rarityMeta } from '@/lib/gameUi';
import { FORGE_MATERIALS, CRAFT_RARITY_WEIGHTS } from '@shared/progression/forge';
import {
  GEMS,
  PASSIVE_META,
  jewelPctRange,
  jewelRecipe,
  type GemDef,
} from '@shared/progression/jewelry';
import type { PassiveType } from '@shared/combat';
import { useForge, type CraftedItem } from '@/features/forge/useForge';
import { Overlay } from '@/components/Overlay';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { UiIcon, PassiveIcon } from '@/components/synty/GameIcons';

/**
 * Fenêtre de craft d'une amulette à passif : choix du composant de zone (puissance
 * du %) + d'une gemme de boss (type de passif). Même parcours que les autres items.
 */
export function JewelCraftModal({ onClose }: { onClose: () => void }) {
  const { data: resources } = useResources();
  const { data: profile } = useProfile();
  const { craftJewel } = useForge();
  const [materialId, setMaterialId] = useState<string>('chene');
  const [gemId, setGemId] = useState<string>('gemme_seve');
  const [crafted, setCrafted] = useState<CraftedItem | null>(null);

  const gold = profile?.gold ?? 0;
  const res = resources ?? {};
  const materials = [...FORGE_MATERIALS].sort(
    (a, b) => a.craftTier - b.craftTier || a.zone - b.zone,
  );
  const mat = materials.find((m) => m.id === materialId) ?? materials[0]!;
  const gem = GEMS.find((g) => g.id === gemId) ?? GEMS[0]!;
  const recipe = jewelRecipe(mat, gem);
  const [pctMin, pctMax] = jewelPctRange(mat, gem);
  const oddsTotal = Object.values(CRAFT_RARITY_WEIGHTS).reduce((s, w) => s + w, 0);
  const jewelName = `Amulette ${mat.suffix} ${gem.epithet}`;
  const ok = gold >= recipe.gold && recipe.materials.every((x) => (res[x.key] ?? 0) >= x.qty);

  return (
    <Overlay
      title={
        <span className="flex items-center gap-2">
          <UiIcon name="jewel" size={20} /> Amulette à passif
        </span>
      }
      onClose={onClose}
    >
      <div className="space-y-3">
        {/* Composant (puissance) */}
        <div>
          <div className="mb-1 text-xs font-medium text-[var(--color-muted)]">
            Composant · puissance du passif (zone, tier)
          </div>
          <div className="flex flex-wrap gap-2">
            {materials.map((m) => {
              // Affordabilité RÉELLE : recette complète du bijou avec la gemme
              // actuellement choisie (matériau de zone + gemme), pas le seul matériau.
              const r = jewelRecipe(m, gem);
              const can = gold >= r.gold && r.materials.every((x) => (res[x.key] ?? 0) >= x.qty);
              return (
                <button
                  key={m.id}
                  onClick={() => setMaterialId(m.id)}
                  className={`rounded-lg border px-3 py-2 text-xs transition ${
                    mat.id === m.id
                      ? 'border-[var(--color-arcane)] bg-[var(--color-arcane)]/15 text-white'
                      : 'border-[var(--color-edge)] bg-black/20 text-[var(--color-muted)] hover:border-white/25'
                  } ${can ? '' : 'opacity-60'}`}
                  title={`Tier ${m.craftTier} · Zone ${m.zone} · ${m.gold} or`}
                >
                  {m.label}
                  <span className="ml-1 text-[9px] font-semibold text-[var(--color-gold-soft)]">T{m.craftTier}</span>
                  <span className="ml-1 text-[9px] text-[var(--color-muted)]">Z{m.zone}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Gemme (passif) */}
        <div>
          <div className="mb-1 text-xs font-medium text-[var(--color-muted)]">
            Gemme · type de passif (1 consommée)
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {GEMS.map((g: GemDef) => {
              const owned = res[g.id] ?? 0;
              // Affordabilité RÉELLE : recette complète avec le matériau courant
              // (or + matériau de zone + cette gemme possédée).
              const rg = jewelRecipe(mat, g);
              const can = gold >= rg.gold && rg.materials.every((x) => (res[x.key] ?? 0) >= x.qty);
              return (
                <button
                  key={g.id}
                  onClick={() => setGemId(g.id)}
                  className={`panel p-2.5 text-left transition ${
                    gem.id === g.id ? 'ring-2 ring-[var(--color-arcane)]' : 'hover:border-white/25'
                  } ${can ? '' : 'opacity-60'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 font-display text-sm font-semibold text-[var(--color-ink)]">
                      <ResourceIcon resKey={g.id} size={16} /> {g.label}
                    </span>
                    <span
                      className={`chip text-[10px] ${
                        owned > 0 ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/5 text-[var(--color-ember)]'
                      }`}
                    >
                      ×{owned}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-[11px] text-[var(--color-arcane)]">
                    <PassiveIcon passive={g.passive} size={12} /> {g.passiveLabel}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Aperçu + coût */}
        <div className="rounded-lg border border-[var(--color-edge)] bg-black/20 p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-display text-sm font-semibold text-[var(--color-ink)]">
              <UiIcon name="jewel" size={16} /> {jewelName}
            </span>
            <span className="chip bg-white/5 text-[10px] text-[var(--color-muted)]">
              Universel · T{mat.craftTier}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1 text-xs text-[var(--color-arcane)]">
            <PassiveIcon passive={gem.passive} size={12} /> {gem.passiveLabel} {pctMin}–{pctMax}%
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className={gold >= recipe.gold ? 'text-[var(--color-gold-soft)]' : 'text-[var(--color-ember)]'}>
              <UiIcon name="gold" size={13} /> {recipe.gold}
            </span>
            {recipe.materials.map((x) => {
              const have = res[x.key] ?? 0;
              return (
                <span
                  key={x.key}
                  className={`inline-flex items-center gap-1 ${
                    have >= x.qty ? 'text-[var(--color-ink)]/80' : 'text-[var(--color-ember)]'
                  }`}
                >
                  <ResourceIcon resKey={x.key} /> {resourceMeta(x.key).label} {have}/{x.qty}
                </span>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.entries(CRAFT_RARITY_WEIGHTS).map(([rarity, w]) => {
              const meta = rarityMeta(rarity);
              return (
                <span key={rarity} className={`chip bg-white/5 ${meta.text}`}>
                  {meta.label} {Math.round((w / oddsTotal) * 100)}%
                </span>
              );
            })}
          </div>
        </div>

        {craftJewel.isError && (
          <p className="text-sm text-[var(--color-ember)]">
            {craftJewel.error instanceof Error ? craftJewel.error.message : 'Erreur'}
          </p>
        )}

        <button
          onClick={() => {
            setCrafted(null);
            craftJewel.mutate(
              { materialId: mat.id, gemId: gem.id },
              { onSuccess: (r) => setCrafted(r.item) },
            );
          }}
          disabled={!ok || craftJewel.isPending}
          className="btn btn-primary w-full text-sm"
        >
          {craftJewel.isPending ? 'Sertissage…' : `Sertir : ${jewelName}`}
        </button>

        {crafted && (
          <div className="panel anim-pop flex items-center justify-between p-3 text-sm">
            <span className="flex items-center gap-2">
              <UiIcon name="jewel" size={18} />
              <span className={rarityMeta(crafted.rarity).text}>{crafted.name}</span>
            </span>
            {crafted.passive_type && (
              <span className="flex items-center gap-1 text-xs text-[var(--color-arcane)]">
                <PassiveIcon passive={crafted.passive_type} size={12} />
                {PASSIVE_META[crafted.passive_type as PassiveType]?.label ?? ''} {crafted.passive_value}%
              </span>
            )}
          </div>
        )}
      </div>
    </Overlay>
  );
}
