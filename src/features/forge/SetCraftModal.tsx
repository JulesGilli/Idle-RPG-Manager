import { useState } from 'react';
import { useResources } from '@/hooks/useResources';
import { useProfile } from '@/hooks/useProfile';
import { rarityMeta } from '@/lib/gameUi';
import { FORGE_MATERIALS } from '@shared/progression/forge';
import {
  SETS,
  setPieceRecipe,
  craftSetPieceStats,
  describeSetEffect,
  setEffectAt,
  type SetPieceRecipe,
} from '@shared/progression/sets';
import { useForge, type CraftedItem } from './useForge';
import { Overlay } from '@/components/Overlay';
import { SyntyGlyph } from '@/components/synty/SyntyIcon';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { UiIcon, SetPieceIcon } from '@/components/synty/GameIcons';
import { rarityHex, STAT_GLYPH } from '@/lib/synty';

const STAT_TINT = { atk: '#fb7185', def: '#56b6f4', hp: '#5fd39b' } as const;

/**
 * Fenêtre de craft d'une pièce de set : MÊME UI que le craft d'arme/armure — on
 * choisit le composant de zone qui fixe la puissance (les stats scalent avec lui).
 */
export function SetCraftModal({ piece, onClose }: { piece: SetPieceRecipe; onClose: () => void }) {
  const { data: resources } = useResources();
  const { data: profile } = useProfile();
  const { craftSet } = useForge();
  const [materialId, setMaterialId] = useState<string>('chene');
  const [crafted, setCrafted] = useState<CraftedItem | null>(null);

  const gold = profile?.gold ?? 0;
  const res = resources ?? {};

  const materials = [...FORGE_MATERIALS].sort(
    (a, b) => a.craftTier - b.craftTier || a.zone - b.zone,
  );
  const mat = materials.find((m) => m.id === materialId) ?? materials[0]!;
  const stats = craftSetPieceStats(piece, mat);
  const recipe = setPieceRecipe(piece, mat);
  const set = SETS.find((s) => s.id === piece.setId);
  const ok = gold >= recipe.gold && recipe.materials.every((m) => (res[m.key] ?? 0) >= m.qty);

  return (
    <Overlay
      title={
        <span className="flex items-center gap-2">
          <SetPieceIcon pieceId={piece.id} size={22} /> {piece.label}
        </span>
      }
      onClose={onClose}
    >
      <div className="space-y-3">
        <div className="text-xs font-medium text-[var(--color-muted)]">
          Choisis le composant — il fixe la zone, le tier et la puissance de la pièce
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {materials.map((m) => {
            // Affordabilité RÉELLE : recette complète de la pièce (matériau de zone
            // + composants de set), pas seulement le coût du matériau de zone.
            const r = setPieceRecipe(piece, m);
            const can = gold >= r.gold && r.materials.every((x) => (res[x.key] ?? 0) >= x.qty);
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
              {piece.label} {mat.suffix}
            </span>
            <span className="chip bg-white/5 text-[10px] text-[var(--color-muted)]">
              T{mat.craftTier} · Zone {mat.zone}
            </span>
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            {stats.atk > 0 && <Stat kind="atk" label="ATK" value={stats.atk} />}
            {stats.def > 0 && <Stat kind="def" label="DEF" value={stats.def} />}
            {stats.hp > 0 && <Stat kind="hp" label="PV" value={stats.hp} />}
          </div>
          {set && (
            <div className="mt-2 border-t border-[var(--color-edge)] pt-2 text-[11px] text-[var(--color-muted)]">
              <div>
                {set.name} · 2 pièces :{' '}
                <span className="text-[var(--color-gold-soft)]">{setBonusLine(set.bonus2)}</span>
              </div>
              <div className="mt-0.5">
                {setEffectAt(set)} pièces :{' '}
                <span className="text-[var(--color-gold-soft)]">{describeSetEffect(set)}</span>
              </div>
            </div>
          )}
          {/* Composants de set en plus du matériau de zone */}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-[var(--color-muted)]">
            <span className={gold >= recipe.gold ? 'text-[var(--color-gold-soft)]' : 'text-[var(--color-ember)]'}>
              <UiIcon name="gold" size={10} /> {recipe.gold}
            </span>
            {recipe.materials.map((m) => (
              <span
                key={m.key}
                className={`inline-flex items-center gap-1 ${
                  (res[m.key] ?? 0) >= m.qty ? 'text-[var(--color-ink)]/70' : 'text-[var(--color-ember)]'
                }`}
              >
                <ResourceIcon resKey={m.key} size={11} /> {res[m.key] ?? 0}/{m.qty}
              </span>
            ))}
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
            craftSet.mutate(
              { pieceId: piece.id, materialId: mat.id },
              { onSuccess: (r) => setCrafted(r.item) },
            );
          }}
          disabled={!ok || craftSet.isPending}
          className="btn btn-primary w-full text-sm"
        >
          {craftSet.isPending ? 'Forge…' : `Forger : ${piece.label} ${mat.suffix}`}
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

function setBonusLine(b: { atk: number; def: number; hp: number }): string {
  return [b.atk ? `+${b.atk} ATK` : null, b.def ? `+${b.def} DEF` : null, b.hp ? `+${b.hp} PV` : null]
    .filter(Boolean)
    .join(' · ');
}

function Stat({ kind, label, value }: { kind: 'atk' | 'def' | 'hp'; label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-[var(--color-ink)]/85">
      <SyntyGlyph src={STAT_GLYPH[kind]} color={STAT_TINT[kind]} size={13} /> {label} +{value}
    </span>
  );
}
