import { useState } from 'react';
import { useResources } from '@/hooks/useResources';
import { useProfile } from '@/hooks/useProfile';
import { rarityMeta } from '@/lib/gameUi';
import {
  FORGE_MATERIALS,
  CRAFT_RARITY_WEIGHTS,
  craftRanges,
  type ForgeBase,
} from '@shared/progression/forge';
import { useForge, type CraftedItem } from './useForge';
import { Overlay } from '@/components/Overlay';
import { SyntyImg, SyntyGlyph } from '@/components/synty/SyntyIcon';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { UiIcon } from '@/components/synty/GameIcons';
import { forgeBaseUrl, rarityHex, STAT_GLYPH } from '@/lib/synty';

const STAT_TINT = { atk: '#fb7185', def: '#56b6f4', hp: '#5fd39b' } as const;

/**
 * Fenêtre de craft d'une arme/armure normale : on choisit le COMPOSANT de zone
 * (zone 1-10, tier 1-4) qui détermine la puissance/le thème, puis on forge.
 */
export function ForgeCraftModal({ base, onClose }: { base: ForgeBase; onClose: () => void }) {
  const { data: resources } = useResources();
  const { data: profile } = useProfile();
  const { craft } = useForge();
  const [materialId, setMaterialId] = useState<string>('chene');
  const [crafted, setCrafted] = useState<CraftedItem | null>(null);

  const gold = profile?.gold ?? 0;
  const res = resources ?? {};

  const materials = [...FORGE_MATERIALS].sort(
    (a, b) => a.craftTier - b.craftTier || a.zone - b.zone,
  );
  const mat = materials.find((m) => m.id === materialId) ?? materials[0]!;
  const ranges = craftRanges(base, mat);
  const oddsTotal = Object.values(CRAFT_RARITY_WEIGHTS).reduce((s, w) => s + w, 0);
  const ok = gold >= mat.gold && mat.materials.every((x) => (res[x.key] ?? 0) >= x.qty);

  return (
    <Overlay
      title={
        <span className="flex items-center gap-2">
          <SyntyImg src={forgeBaseUrl(base.id)} size={22} title={base.label} /> {base.label}
        </span>
      }
      onClose={onClose}
    >
      <div className="space-y-3">
        <div className="text-xs font-medium text-[var(--color-muted)]">
          Choisis le composant — il fixe la zone, le tier et la puissance de l'objet
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {materials.map((m) => {
            const can = gold >= m.gold && m.materials.every((x) => (res[x.key] ?? 0) >= x.qty);
            const active = mat.id === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setMaterialId(m.id)}
                className={`rounded-lg border p-2.5 text-left transition ${
                  active
                    ? 'border-[var(--color-arcane)] bg-[var(--color-arcane)]/10'
                    : 'border-[var(--color-edge)] bg-black/20 hover:border-white/25'
                } ${can ? '' : 'opacity-60'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-display text-sm font-semibold text-[var(--color-ink)]">
                    {m.label}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="chip bg-[var(--color-gold)]/15 text-[10px] font-semibold text-[var(--color-gold-soft)]">
                      T{m.craftTier}
                    </span>
                    <span className="chip bg-white/5 text-[10px] text-[var(--color-muted)]">
                      Z{m.zone}
                    </span>
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className={gold >= m.gold ? 'text-[var(--color-gold-soft)]' : 'text-[var(--color-ember)]'}>
                    <UiIcon name="gold" size={11} /> {m.gold}
                  </span>
                  {m.materials.map((x) => {
                    const have = res[x.key] ?? 0;
                    return (
                      <span
                        key={x.key}
                        className={`inline-flex items-center gap-1 ${
                          have >= x.qty ? 'text-[var(--color-ink)]/75' : 'text-[var(--color-ember)]'
                        }`}
                      >
                        <ResourceIcon resKey={x.key} /> {have}/{x.qty}
                      </span>
                    );
                  })}
                </div>
              </button>
            );
          })}
        </div>

        {/* Aperçu des stats obtenues avec le composant choisi */}
        <div className="rounded-lg border border-[var(--color-edge)] bg-black/20 p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-display text-sm font-semibold text-[var(--color-ink)]">
              {base.label} {mat.suffix}
            </span>
            <span className="chip bg-white/5 text-[10px] text-[var(--color-muted)]">
              T{mat.craftTier} · Zone {mat.zone}
            </span>
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            {ranges.atk[1] > 0 && <Range kind="atk" label="ATK" lo={ranges.atk[0]} hi={ranges.atk[1]} />}
            {ranges.def[1] > 0 && <Range kind="def" label="DEF" lo={ranges.def[0]} hi={ranges.def[1]} />}
            {ranges.hp[1] > 0 && <Range kind="hp" label="PV" lo={ranges.hp[0]} hi={ranges.hp[1]} />}
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

        {craft.isError && (
          <p className="text-sm text-[var(--color-ember)]">
            {craft.error instanceof Error ? craft.error.message : 'Erreur'}
          </p>
        )}

        <button
          onClick={() => {
            setCrafted(null);
            craft.mutate(
              { baseId: base.id, materialId: mat.id },
              { onSuccess: (r) => setCrafted(r.item) },
            );
          }}
          disabled={!ok || craft.isPending}
          className="btn btn-primary w-full text-sm"
        >
          {craft.isPending ? 'Forge…' : `Forger : ${base.label} ${mat.suffix}`}
        </button>

        {crafted && (
          <div
            className="anim-pop flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
            style={{ borderColor: `${rarityHex(crafted.rarity)}66` }}
          >
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

function Range({ kind, label, lo, hi }: { kind: 'atk' | 'def' | 'hp'; label: string; lo: number; hi: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-[var(--color-ink)]/85">
      <SyntyGlyph src={STAT_GLYPH[kind]} color={STAT_TINT[kind]} size={13} /> {label} {lo}–{hi}
    </span>
  );
}
