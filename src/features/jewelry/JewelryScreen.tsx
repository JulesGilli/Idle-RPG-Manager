import { useState } from 'react';
import { useItems, type ItemRow } from '@/features/heroes/useItems';
import { useResources } from '@/hooks/useResources';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { SyntyImg } from '@/components/synty/SyntyIcon';
import { UiIcon, PassiveIcon, ItemTypeIcon } from '@/components/synty/GameIcons';
import { MAP_ART, type UiIconName } from '@/lib/synty';
import { useProfile } from '@/hooks/useProfile';
import { rarityMeta } from '@/lib/gameUi';
import {
  gemByPassive,
  refinedJewelPct,
  refineCost,
  refineSuccessChance,
  REFINE_MAX,
} from '@shared/progression/jewelry';
import { SETS, SET_PIECES } from '@shared/progression/sets';
import { useForge } from '@/features/forge/useForge';
import { CraftItemCard } from '@/features/forge/CraftItemCard';
import { SetCraftModal } from '@/features/forge/SetCraftModal';
import { JewelCraftModal } from './JewelCraftModal';
import { BackToVillage } from '@/components/BackToVillage';

export function JewelryScreen() {
  const [tab, setTab] = useState<'craft' | 'refine'>('craft');
  return (
    <section className="anim-fade space-y-5">
      <BackToVillage />
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
        <TabBtn active={tab === 'craft'} onClick={() => setTab('craft')} icon="jewel" label="Sertir" />
        <TabBtn active={tab === 'refine'} onClick={() => setTab('refine')} icon="refine" label="Raffiner" />
      </div>
      {tab === 'craft' ? <CraftJewelTab /> : <RefineTab />}
    </section>
  );
}

function TabBtn({
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

/* ------------------------------------------------------------------ SERTIR */

function CraftJewelTab() {
  const [openId, setOpenId] = useState<string | null>(null);
  const setPieces = SET_PIECES.filter((p) => p.slot === 'jewel');
  const openSet = setPieces.find((p) => p.id === openId) ?? null;

  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--color-muted)]">
        Choisis un bijou à sertir : la fenêtre de craft s'ouvre pour choisir le composant (zone,
        tier) et la gemme (passif), ou forger une pièce de set.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <CraftItemCard
          onClick={() => setOpenId('passive')}
          icon={<UiIcon name="jewel" size={26} />}
          name="Amulette à passif"
          sub="Composant + gemme"
        />
        {setPieces.map((p) => (
          <CraftItemCard
            key={p.id}
            onClick={() => setOpenId(p.id)}
            icon={<ItemTypeIcon type="jewel" size={24} color="var(--color-muted)" />}
            name={p.label}
            badge={SETS.find((s) => s.id === p.setId)?.name ?? 'Set'}
          />
        ))}
      </div>

      {openId === 'passive' && <JewelCraftModal onClose={() => setOpenId(null)} />}
      {openSet && <SetCraftModal piece={openSet} onClose={() => setOpenId(null)} />}
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
                <UiIcon name="jewel" size={16} />
                <span className={`truncate ${meta.text}`}>{item.name}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-[10px] text-[var(--color-arcane)]">
                {item.passive_type && <PassiveIcon passive={item.passive_type} size={11} />}{' '}
                {item.passive_value}% · +{item.upgrade_level}
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
                      ? `✓ Réussite ! Passif à ${r.passive_value}%`
                      : `✗ Échec — retour au niveau +${r.upgrade_level} (${r.passive_value}%)`,
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
      <div className="mt-1 flex items-center gap-1 text-sm text-[var(--color-arcane)]">
        {item.passive_type && <PassiveIcon passive={item.passive_type} size={13} />} {gem.passiveLabel}{' '}
        {item.passive_value}%
        <span className="ml-2 text-[10px] text-[var(--color-muted)]">(plafond {gem.maxPct}%)</span>
      </div>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        {gem.description.replace('{X}', `${item.passive_value}`)}
      </p>

      {maxed || capped ? (
        <p className="mt-4 text-sm text-[var(--color-gold-soft)]">
          {capped ? `Plafond du passif atteint (${gem.maxPct}%)` : 'Raffinement maximum'}
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
              <span
                className={`inline-flex items-center gap-1 ${
                  gold >= cost.gold ? 'text-[var(--color-ink)]' : 'text-[var(--color-ember)]'
                }`}
              >
                <UiIcon name="gold" size={12} /> {cost.gold}
                <span
                  className={`inline-flex items-center gap-1 ${
                    gemsOwned >= 1 ? '' : 'text-[var(--color-ember)]'
                  }`}
                >
                  {' '}
                  · <ResourceIcon resKey={gem.id} size={12} /> {gem.label} 1/{gemsOwned}
                </span>
              </span>
            </div>
            <p className="mt-1 text-[10px] text-[var(--color-muted)]/70">
              Un échec fait reculer le raffinage d'un niveau (la gemme est consommée).
            </p>
          </div>

          <button onClick={onRefine} disabled={busy || !affordable} className="btn btn-primary mt-3 text-sm">
            {busy ? 'Raffinage…' : 'Raffiner'}
          </button>
        </>
      )}

      {feedback && <p className="mt-3 text-sm text-[var(--color-ink)]/90">{feedback}</p>}
    </div>
  );
}
