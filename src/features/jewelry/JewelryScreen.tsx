import { useState } from 'react';
import { useItems, type ItemRow } from '@/features/heroes/useItems';
import { useResources, resourceMeta } from '@/hooks/useResources';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { SyntyImg } from '@/components/synty/SyntyIcon';
import { MAP_ART } from '@/lib/synty';
import { useProfile } from '@/hooks/useProfile';
import { rarityMeta } from '@/lib/gameUi';
import { FORGE_MATERIALS, CRAFT_RARITY_WEIGHTS } from '@shared/progression/forge';
import {
  GEMS,
  PASSIVE_META,
  jewelPctRange,
  jewelRecipe,
  gemByPassive,
  refinedJewelPct,
  refineCost,
  refineSuccessChance,
  REFINE_MAX,
  type GemDef,
} from '@shared/progression/jewelry';
import type { PassiveType } from '@shared/combat';
import { useForge, type CraftedItem } from '@/features/forge/useForge';

export function JewelryScreen() {
  const [tab, setTab] = useState<'craft' | 'refine'>('craft');
  return (
    <section className="anim-fade space-y-5">
      <div>
        <h2 className="heading flex items-center gap-2 text-2xl">
          <SyntyImg src={MAP_ART.treasure} size={26} />
          Joaillerie
        </h2>
        <p className="text-sm text-[var(--color-muted)]">
          Sertis des bijoux (composant de zone + gemme de boss), puis raffine leur passif.
        </p>
      </div>
      <div className="flex gap-2">
        <TabBtn active={tab === 'craft'} onClick={() => setTab('craft')} label="💍 Sertir" />
        <TabBtn active={tab === 'refine'} onClick={() => setTab('refine')} label="🔷 Raffiner" />
      </div>
      {tab === 'craft' ? <CraftJewelTab /> : <RefineTab />}
    </section>
  );
}

function TabBtn({
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

/* ------------------------------------------------------------------ SERTIR */

function CraftJewelTab() {
  const { data: resources } = useResources();
  const { data: profile } = useProfile();
  const { craftJewel } = useForge();
  const [materialId, setMaterialId] = useState<string>('chene');
  const [gemId, setGemId] = useState<string>('gemme_seve');
  const [lastCrafted, setLastCrafted] = useState<CraftedItem | null>(null);

  const gold = profile?.gold ?? 0;
  const res = resources ?? {};

  const materials = [...FORGE_MATERIALS].sort(
    (a, b) => a.craftTier - b.craftTier || a.zone - b.zone,
  );
  const mat = materials.find((m) => m.id === materialId) ?? materials[0]!;
  const gem = GEMS.find((g) => g.id === gemId) ?? GEMS[0]!;
  const recipe = jewelRecipe(mat, gem);
  const [pctMin, pctMax] = jewelPctRange(mat, gem);

  const affordable =
    gold >= recipe.gold && recipe.materials.every((x) => (res[x.key] ?? 0) >= x.qty);
  const oddsTotal = Object.values(CRAFT_RARITY_WEIGHTS).reduce((s, w) => s + w, 0);
  const jewelName = `Amulette ${mat.suffix} ${gem.epithet}`;

  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--color-muted)]">
        Un bijou ne donne <span className="text-[var(--color-ink)]">aucune stat brute</span> : il
        porte un <span className="text-[var(--color-ink)]">passif en %</span>. Le composant de
        zone fixe la puissance du %, la gemme (drop exclusif des boss 👑) fixe le type de passif —
        combine-les librement.
      </p>

      {/* Composant (puissance) */}
      <div>
        <div className="mb-2 text-sm font-medium text-[var(--color-muted)]">
          Composant · puissance du passif
        </div>
        <div className="flex flex-wrap gap-2">
          {materials.map((m) => {
            const can = gold >= m.gold && m.materials.every((x) => (res[x.key] ?? 0) >= x.qty);
            return (
              <button
                key={m.id}
                onClick={() => setMaterialId(m.id)}
                className={`rounded-lg border px-3 py-2 text-xs transition ${
                  mat.id === m.id
                    ? 'border-[var(--color-arcane)] bg-[var(--color-arcane)]/15 text-white'
                    : 'border-[var(--color-edge)] bg-black/20 text-[var(--color-muted)] hover:border-white/25'
                } ${can ? '' : 'opacity-60'}`}
                title={`Zone ${m.zone} · 💰 ${m.gold}`}
              >
                {m.label}
                <span className="ml-1 text-[9px] text-[var(--color-muted)]">Z{m.zone}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Gemme (passif) */}
      <div>
        <div className="mb-2 text-sm font-medium text-[var(--color-muted)]">
          Gemme · type de passif (1 consommée par craft)
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {GEMS.map((g: GemDef) => {
            const owned = res[g.id] ?? 0;
            const active = gem.id === g.id;
            return (
              <button
                key={g.id}
                onClick={() => setGemId(g.id)}
                className={`panel p-3 text-left transition ${
                  active ? 'ring-2 ring-[var(--color-arcane)]' : 'hover:border-white/25'
                } ${owned > 0 ? '' : 'opacity-60'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-display text-sm font-semibold text-[var(--color-ink)]">
                    {g.icon} {g.label}
                  </span>
                  <span
                    className={`chip text-[10px] ${
                      owned > 0
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-white/5 text-[var(--color-ember)]'
                    }`}
                  >
                    ×{owned}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-[var(--color-arcane)]">
                  {PASSIVE_META[g.passive].icon} {g.passiveLabel}
                </div>
                <div className="mt-0.5 text-[10px] text-[var(--color-muted)]">
                  {g.description.replace(
                    '{X}',
                    `${jewelPctRange(mat, g)[0]}–${jewelPctRange(mat, g)[1]}`,
                  )}
                </div>
                <div className="mt-1 text-[9px] text-[var(--color-muted)]/60">
                  Boss zone {g.zone} 👑
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Aperçu + coût */}
      <div className="rounded-lg border border-[var(--color-edge)] bg-black/20 p-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="font-display text-sm font-semibold text-[var(--color-ink)]">
            💍 {jewelName}
          </span>
          <span className="chip bg-white/5 text-[10px] text-[var(--color-muted)]">
            Universel · Tier {mat.craftTier}
          </span>
        </div>
        <div className="text-xs text-[var(--color-arcane)]">
          {PASSIVE_META[gem.passive].icon} {gem.passiveLabel} {pctMin}–{pctMax}% ·{' '}
          <span className="text-[var(--color-muted)]">
            {gem.description.replace('{X}', `${pctMin}–${pctMax}`)}
          </span>
        </div>
        <ul className="mt-2 space-y-0.5 text-xs">
          <li
            className={
              gold >= recipe.gold ? 'text-[var(--color-gold-soft)]' : 'text-[var(--color-ember)]'
            }
          >
            💰 {recipe.gold}
          </li>
          {recipe.materials.map((x) => {
            const have = res[x.key] ?? 0;
            return (
              <li
                key={x.key}
                className={`flex items-center gap-1 ${
                  have >= x.qty ? 'text-[var(--color-ink)]/80' : 'text-[var(--color-ember)]'
                }`}
              >
                <ResourceIcon resKey={x.key} /> {resourceMeta(x.key).label} : {have}/{x.qty}
              </li>
            );
          })}
        </ul>
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
        <p className="mt-2 text-[10px] text-[var(--color-muted)]/70">
          La rareté module légèrement le % obtenu. La gemme n'influe pas sur la puissance, elle
          choisit le passif.
        </p>
      </div>

      {craftJewel.isError && (
        <p className="text-sm text-[var(--color-ember)]">
          {craftJewel.error instanceof Error ? craftJewel.error.message : 'Erreur'}
        </p>
      )}

      <button
        onClick={() => {
          setLastCrafted(null);
          craftJewel.mutate(
            { materialId: mat.id, gemId: gem.id },
            { onSuccess: (r) => setLastCrafted(r.item) },
          );
        }}
        disabled={!affordable || craftJewel.isPending}
        className="btn btn-primary w-full text-sm"
      >
        {craftJewel.isPending ? 'Sertissage…' : `💍 Sertir : ${jewelName}`}
      </button>

      {lastCrafted && (
        <div className="panel anim-pop flex items-center justify-between p-3 text-sm">
          <span className="flex items-center gap-2">
            <span>💍</span>
            <span className={rarityMeta(lastCrafted.rarity).text}>{lastCrafted.name}</span>
          </span>
          <span className="text-xs text-[var(--color-arcane)]">
            {lastCrafted.passive_type
              ? `${PASSIVE_META[lastCrafted.passive_type as PassiveType]?.icon ?? ''} ${
                  PASSIVE_META[lastCrafted.passive_type as PassiveType]?.label ?? ''
                } ${lastCrafted.passive_value}%`
              : ''}
          </span>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- RAFFINER */

function RefineTab() {
  const { data: items } = useItems();
  const { data: resources } = useResources();
  const { data: profile } = useProfile();
  const { refineJewel } = useForge();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const jewels = (items ?? []).filter((i) => i.item_type === 'jewel' && i.passive_type);
  const selected = jewels.find((i) => i.id === selectedId) ?? null;
  const gold = profile?.gold ?? 0;
  const res = resources ?? {};

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      {/* Liste des bijoux */}
      <div className="panel max-h-[60vh] overflow-y-auto p-2">
        {jewels.length === 0 && (
          <p className="p-3 text-sm text-[var(--color-muted)]">
            Aucun bijou à raffiner — sertis-en un d'abord.
          </p>
        )}
        {jewels.map((item) => {
          const meta = rarityMeta(item.rarity);
          const pm = PASSIVE_META[item.passive_type as PassiveType];
          return (
            <button
              key={item.id}
              onClick={() => {
                setSelectedId(item.id);
                setFeedback(null);
              }}
              className={`mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                selectedId === item.id ? 'bg-[var(--color-arcane)]/15' : 'hover:bg-white/[0.04]'
              }`}
            >
              <span className="flex items-center gap-2">
                <span>💍</span>
                <span className={`truncate ${meta.text}`}>{item.name}</span>
              </span>
              <span className="shrink-0 text-[10px] text-[var(--color-arcane)]">
                {pm?.icon} {item.passive_value}% · +{item.upgrade_level}
              </span>
            </button>
          );
        })}
      </div>

      {/* Détail / raffinage */}
      <div className="panel p-4">
        {!selected ? (
          <p className="text-sm text-[var(--color-muted)]">Sélectionne un bijou à gauche.</p>
        ) : (
          <RefineDetail
            item={selected}
            gold={gold}
            res={res}
            feedback={feedback}
            busy={refineJewel.isPending}
            onRefine={() => {
              setFeedback(null);
              refineJewel.mutate(selected.id, {
                onSuccess: (r) =>
                  setFeedback(
                    r.success
                      ? `✅ Réussite ! Passif à ${r.passive_value}%`
                      : `❌ Échec — retour au niveau +${r.upgrade_level} (${r.passive_value}%)`,
                  ),
                onError: (e) => setFeedback(e instanceof Error ? e.message : 'Erreur'),
              });
            }}
          />
        )}
      </div>
    </div>
  );
}

function RefineDetail({
  item,
  gold,
  res,
  feedback,
  busy,
  onRefine,
}: {
  item: ItemRow;
  gold: number;
  res: Record<string, number>;
  feedback: string | null;
  busy: boolean;
  onRefine: () => void;
}) {
  const meta = rarityMeta(item.rarity);
  const gem = gemByPassive(item.passive_type ?? '');
  const pm = PASSIVE_META[item.passive_type as PassiveType];

  if (!gem) {
    return <p className="text-sm text-[var(--color-ember)]">Passif inconnu.</p>;
  }

  const base = item.base_passive_value > 0 ? item.base_passive_value : item.passive_value;
  const maxed = item.upgrade_level >= REFINE_MAX;
  const capped = item.passive_value >= gem.maxPct;
  const nextValue = refinedJewelPct(base, item.upgrade_level + 1, gem);
  const cost = refineCost(item.upgrade_level, gem);
  const success = Math.round(refineSuccessChance(item.upgrade_level) * 100);
  const gemsOwned = res[gem.id] ?? 0;
  const affordable = gold >= cost.gold && gemsOwned >= 1;

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className={`font-display text-lg font-semibold ${meta.text}`}>{item.name}</span>
        <span className="chip bg-white/5 text-[var(--color-muted)]">
          Raffinage +{item.upgrade_level}/{REFINE_MAX}
        </span>
      </div>
      <div className="mt-1 text-sm text-[var(--color-arcane)]">
        {pm?.icon} {gem.passiveLabel} {item.passive_value}%
        <span className="ml-2 text-[10px] text-[var(--color-muted)]">
          (plafond {gem.maxPct}%)
        </span>
      </div>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        {gem.description.replace('{X}', `${item.passive_value}`)}
      </p>

      {maxed || capped ? (
        <p className="mt-4 text-sm text-[var(--color-gold-soft)]">
          {capped ? `Plafond du passif atteint (${gem.maxPct}%) 🏆` : 'Raffinement maximum 🏆'}
        </p>
      ) : (
        <>
          <div className="mt-4 rounded-lg border border-[var(--color-edge)] bg-black/20 p-3 text-xs">
            <div className="mb-1 flex justify-between">
              <span className="text-[var(--color-muted)]">Prochain palier</span>
              <span className="text-emerald-300">
                {item.passive_value}% → {nextValue}%
              </span>
            </div>
            <div className="mb-1 flex justify-between">
              <span className="text-[var(--color-muted)]">Réussite</span>
              <span
                className={
                  success >= 60
                    ? 'text-emerald-300'
                    : success >= 35
                      ? 'text-[var(--color-gold)]'
                      : 'text-[var(--color-ember)]'
                }
              >
                {success}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-muted)]">Coût</span>
              <span className={gold >= cost.gold ? 'text-[var(--color-ink)]' : 'text-[var(--color-ember)]'}>
                💰 {cost.gold}
                <span className={gemsOwned >= 1 ? '' : 'text-[var(--color-ember)]'}>
                  {' '}
                  · {gem.icon} {gem.label} 1/{gemsOwned}
                </span>
              </span>
            </div>
            <p className="mt-1 text-[10px] text-[var(--color-muted)]/70">
              Un échec fait reculer le raffinage d'un niveau (la gemme est consommée).
            </p>
          </div>

          <button
            onClick={onRefine}
            disabled={busy || !affordable}
            className="btn btn-primary mt-3 text-sm"
          >
            {busy ? 'Raffinage…' : '🔷 Raffiner'}
          </button>
        </>
      )}

      {feedback && <p className="mt-3 text-sm text-[var(--color-ink)]/90">{feedback}</p>}
    </div>
  );
}
