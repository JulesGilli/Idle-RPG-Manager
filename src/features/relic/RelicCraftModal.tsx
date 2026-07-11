import { useState } from 'react';
import { useResources } from '@/hooks/useResources';
import { useProfile } from '@/hooks/useProfile';
import { rarityMeta } from '@/lib/gameUi';
import { FORGE_MATERIALS } from '@shared/progression/forge';
import { relicRecipe, relicRanges, type RelicBase } from '@shared/progression/relic';
import { useForge, type CraftedItem } from '@/features/forge/useForge';
import { Overlay } from '@/components/Overlay';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { SyntyGlyph } from '@/components/synty/SyntyIcon';
import { UiIcon, RelicIcon } from '@/components/synty/GameIcons';
import { rarityHex, STAT_GLYPH } from '@/lib/synty';

const STAT_TINT = { atk: '#fb7185', def: '#56b6f4', hp: '#5fd39b' } as const;

/** Fenêtre de craft d'une relique normale : choix du composant de zone → stats. */
export function RelicCraftModal({ base, onClose }: { base: RelicBase; onClose: () => void }) {
  const { data: resources } = useResources();
  const { data: profile } = useProfile();
  const { craftRelic } = useForge();
  const [materialId, setMaterialId] = useState<string>('chene');
  const [crafted, setCrafted] = useState<CraftedItem | null>(null);

  const gold = profile?.gold ?? 0;
  const res = resources ?? {};
  const materials = [...FORGE_MATERIALS].sort(
    (a, b) => a.craftTier - b.craftTier || a.zone - b.zone,
  );
  const mat = materials.find((m) => m.id === materialId) ?? materials[0]!;
  const recipe = relicRecipe(mat);
  const ranges = relicRanges(base, mat);
  const ok = gold >= recipe.gold && recipe.materials.every((m) => (res[m.key] ?? 0) >= m.qty);

  return (
    <Overlay
      title={
        <span className="flex items-center gap-2">
          <RelicIcon baseId={base.id} size={20} /> {base.label}
        </span>
      }
      onClose={onClose}
    >
      <div className="space-y-3">
        <div className="text-xs font-medium text-[var(--color-muted)]">
          Choisis le composant — il fixe la zone, le tier et la puissance de la relique
        </div>
        <div className="flex flex-wrap gap-2">
          {materials.map((m) => {
            // Affordabilité RÉELLE : recette complète de la relique (matériau de zone
            // + surcoût d'or + matériaux de donjon), pas le seul coût du matériau.
            const r = relicRecipe(m);
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
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
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
                  <ResourceIcon resKey={m.key} /> {have}/{m.qty}
                </span>
              );
            })}
          </div>
          <p className="mt-2 text-[10px] text-[var(--color-muted)]/70">
            Le composant fixe la puissance ; plus la relique est forte, plus elle exige de{' '}
            <span className="text-[var(--color-gold-soft)]">fragments de relique</span> — farme des
            donjons plus durs pour en récolter davantage.
          </p>
        </div>

        {craftRelic.isError && (
          <p className="text-sm text-[var(--color-ember)]">
            {craftRelic.error instanceof Error ? craftRelic.error.message : 'Erreur'}
          </p>
        )}

        <button
          onClick={() => {
            setCrafted(null);
            craftRelic.mutate(
              { baseId: base.id, materialId: mat.id },
              { onSuccess: (r) => setCrafted(r.item) },
            );
          }}
          disabled={!ok || craftRelic.isPending}
          className="btn btn-primary w-full text-sm"
        >
          {craftRelic.isPending ? 'Forge…' : `Forger : ${base.label} ${mat.suffix}`}
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
