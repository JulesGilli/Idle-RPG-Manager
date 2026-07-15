import { useMemo, useRef, useState } from 'react';
import { useItems, type ItemRow } from '@/features/heroes/useItems';
import { useHeroes } from '@/features/heroes/useHeroes';
import { useResources } from '@/hooks/useResources';
import { useProfile } from '@/hooks/useProfile';
import { rarityColor } from '@/lib/gameUi';
import {
  upgradeCost,
  upgradeSuccessChance,
  UPGRADE_MAX,
  zoneFarmMaterial,
  type Recipe,
} from '@shared/progression/forge';
import {
  baseIdOfName,
  weaponTypeBonus,
  blessingCost,
  validateBless,
} from '@shared/progression/blessing';
import { useForge } from './useForge';
import { CraftStudio } from './CraftStudio';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { UiIcon, EquipmentIcon } from '@/components/synty/GameIcons';
import { ZoneUpgradeStars, BlessingStars } from '@/components/ItemStars';
import { materialZone } from '@/lib/itemZone';
import { type UiIconName } from '@/lib/synty';
import { BackToVillage } from '@/components/BackToVillage';
import { ForgeScene } from './ForgeScene';

export function ForgeScreen() {
  const [tab, setTab] = useState<'craft' | 'upgrade'>('craft');
  return (
    <section className="anim-fade space-y-5">
      <BackToVillage />
      <div className="panel relative overflow-hidden p-0">
        <ForgeScene />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/45 to-transparent p-5">
          <h2 className="heading flex items-center gap-2 text-2xl">
            <UiIcon name="forge" size={24} color="var(--color-gold-soft)" />
            Forge
          </h2>
          <p className="max-w-xl text-sm text-white/80">
            Le forgeron fabrique armes et armures — pièces classiques puis pièces de set (avec le butin
            d'expédition) —, puis renforce le tout. Bijoux à la Joaillerie, reliques à l'Autel.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <TabBtn active={tab === 'craft'} onClick={() => setTab('craft')} icon="craft" label="Fabriquer" />
        <TabBtn active={tab === 'upgrade'} onClick={() => setTab('upgrade')} icon="xp" label="Renforcer" />
      </div>
      {tab === 'craft' ? <CraftTab /> : <UpgradeTab />}
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

/* ------------------------------------------------------------------ CRAFT */

function CraftTab() {
  return (
    <div data-tour="forge-base">
      <CraftStudio />
    </div>
  );
}

/* ---------------------------------------------------------------- UPGRADE */

function UpgradeTab() {
  const { data: items } = useItems();
  const { data: heroes } = useHeroes();
  const { data: resources } = useResources();
  const { data: profile } = useProfile();
  const { upgrade, bless } = useForge();

  // item id → héros qui le porte (comme l'inventaire).
  const equippedBy = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of heroes ?? []) {
      for (const it of [h.weapon, h.armor, h.jewel, h.relic]) {
        if (it) map.set(it.id, h.name);
      }
    }
    return map;
  }, [heroes]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [target, setTarget] = useState(10);
  const [running, setRunning] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const stopRef = useRef(false);

  // Les bijoux ne portent pas de stats brutes : pas d'amélioration.
  const list = (items ?? []).filter((i) => i.item_type !== 'jewel');
  const selected = list.find((i) => i.id === selectedId) ?? null;
  const gold = profile?.gold ?? 0;
  const res = resources ?? {};

  function canAfford(recipe: Recipe): boolean {
    return gold >= recipe.gold && recipe.materials.every((m) => (res[m.key] ?? 0) >= m.qty);
  }

  async function runAuto(item: ItemRow) {
    stopRef.current = false;
    setRunning(true);
    setFeedback(null);
    let level = item.upgrade_level;
    let ups = 0;
    let downs = 0;
    try {
      while (level < target && !stopRef.current) {
        const r = await upgrade.mutateAsync(item.id);
        if (r.upgrade_level > level) ups += 1;
        else downs += 1;
        level = r.upgrade_level;
      }
      setFeedback(`Terminé au niveau ${level} · ${ups} réussite(s), ${downs} échec(s)`);
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : 'Arrêt (ressources ?)');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      {/* Liste des objets */}
      <div className="panel max-h-[60vh] overflow-y-auto p-2">
        {list.length === 0 && (
          <p className="p-3 text-sm text-[var(--color-muted)]">Aucun objet à améliorer.</p>
        )}
        {list.map((item) => {
          return (
            <button
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              className={`mb-1 flex w-full flex-col gap-1 rounded-lg px-3 py-2 text-left text-sm transition ${
                selectedId === item.id ? 'bg-[var(--color-arcane)]/15' : 'hover:bg-white/[0.04]'
              }`}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <EquipmentIcon item={item} size={16} color="var(--color-muted)" />
                  <span className="truncate" style={{ color: rarityColor(item.rarity) }}>
                    {item.name}
                  </span>
                </span>
                <span className="shrink-0 text-[10px] text-[var(--color-muted)]">
                  T{item.tier} · +{item.upgrade_level}
                </span>
              </span>
              <div className="flex items-center justify-between gap-2">
                <ZoneUpgradeStars zone={materialZone(item)} upgrade={item.upgrade_level} size={11} />
                {equippedBy.get(item.id) && (
                  <span className="inline-flex items-center gap-1 truncate text-[10px] font-semibold text-[var(--color-gold-soft)]">
                    <UiIcon name="squad" size={10} color="currentColor" />
                    {equippedBy.get(item.id)}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Détail / actions */}
      <div className="panel p-4">
        {!selected ? (
          <p className="text-sm text-[var(--color-muted)]">Sélectionne un objet à gauche.</p>
        ) : (
          <UpgradeDetail
            item={selected}
            wearer={equippedBy.get(selected.id)}
            gold={gold}
            res={res}
            canAfford={canAfford}
            running={running}
            feedback={feedback}
            target={target}
            setTarget={setTarget}
            onUpgradeOnce={() => {
              setFeedback(null);
              upgrade.mutate(selected.id, {
                onSuccess: (r) => setFeedback(r.success ? '✓ Réussite !' : '✗ Échec — niveau -1'),
                onError: (e) => setFeedback(e instanceof Error ? e.message : 'Erreur'),
              });
            }}
            onAuto={() => runAuto(selected)}
            onStop={() => (stopRef.current = true)}
            busy={upgrade.isPending || running}
            onBless={() => {
              setFeedback(null);
              bless.mutate(selected.id, {
                onSuccess: (r) => setFeedback(`✦ Bénédiction +${r.blessing_level} !`),
                onError: (e) => setFeedback(e instanceof Error ? e.message : 'Erreur'),
              });
            }}
            blessBusy={bless.isPending}
          />
        )}
      </div>
    </div>
  );
}

function UpgradeDetail({
  item,
  wearer,
  gold,
  res,
  canAfford,
  running,
  feedback,
  target,
  setTarget,
  onUpgradeOnce,
  onAuto,
  onStop,
  busy,
  onBless,
  blessBusy,
}: {
  item: ItemRow;
  wearer: string | undefined;
  gold: number;
  res: Record<string, number>;
  canAfford: (r: Recipe) => boolean;
  running: boolean;
  feedback: string | null;
  target: number;
  setTarget: (n: number) => void;
  onUpgradeOnce: () => void;
  onAuto: () => void;
  onStop: () => void;
  busy: boolean;
  onBless: () => void;
  blessBusy: boolean;
}) {
  const blessed = (item.blessing_level ?? 0) > 0;
  const maxed = item.upgrade_level >= UPGRADE_MAX;
  // Bénédiction : uniquement les armes portant un amplificateur de type.
  const blessable = item.item_type === 'weapon' && weaponTypeBonus(baseIdOfName(item.name) ?? '') != null;
  const blessCheck = validateBless(item.name, item.item_type, item.upgrade_level, item.blessing_level ?? 0);
  const blessRecipe = blessingCost(item.blessing_level ?? 0);
  const blessAffordable = canAfford(blessRecipe);
  // Matériau consommé = farm de la zone de l'objet (set = zone 10, sinon suffixe).
  // `materialZone` = même déduction que l'inventaire (set → 10, sinon suffixe du nom).
  const zone = materialZone(item);
  const cost = upgradeCost(item.upgrade_level, zoneFarmMaterial(zone || 1));
  const success = Math.round(upgradeSuccessChance(item.upgrade_level) * 100);
  const affordable = canAfford(cost);

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="font-display text-lg font-semibold" style={{ color: rarityColor(item.rarity) }}>
          {item.name}
        </span>
        <span className="chip bg-white/5 text-[var(--color-muted)]">
          Tier {item.tier} · Niv. +{item.upgrade_level}/{UPGRADE_MAX}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ZoneUpgradeStars zone={zone} upgrade={item.upgrade_level} size={14} />
        <BlessingStars level={item.blessing_level} size={14} />
        <span className="text-[10px] text-[var(--color-muted)]">Zone {zone || '?'}/10</span>
        {wearer && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-gold-soft)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-gold-soft)]">
            <UiIcon name="squad" size={11} color="currentColor" /> Équipé par {wearer}
          </span>
        )}
      </div>
      <div className="mt-1 text-xs text-[var(--color-muted)]">
        {[
          item.atk_bonus ? `+${item.atk_bonus} ATK` : null,
          item.def_bonus ? `+${item.def_bonus} DEF` : null,
          item.hp_bonus ? `+${item.hp_bonus} PV` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </div>

      {maxed ? (
        <p className="mt-4 text-sm text-[var(--color-gold-soft)]">Niveau maximum atteint</p>
      ) : blessed ? (
        <p className="mt-4 text-sm text-[var(--color-gold-soft)]">
          Arme bénie — le renforcement est désormais verrouillé.
        </p>
      ) : (
        <>
          <div className="mt-4 rounded-lg border border-[var(--color-edge)] bg-black/20 p-3 text-xs">
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
            <div className="flex items-start justify-between gap-2">
              <span className="text-[var(--color-muted)]">Coût</span>
              <span className="flex flex-wrap items-center justify-end gap-1">
                {/* Or : rouge si insuffisant. */}
                <span
                  className={`inline-flex items-center gap-1 rounded px-1 ${
                    gold >= cost.gold
                      ? 'text-[var(--color-ink)]'
                      : 'bg-[var(--color-ember)]/15 font-semibold text-[var(--color-ember)] ring-1 ring-[var(--color-ember)]/40'
                  }`}
                >
                  <UiIcon name="gold" size={12} /> {cost.gold}
                </span>
                {/* Matériaux : chip rouge + ratio possédé/requis quand il en manque. */}
                {cost.materials.map((m) => {
                  const have = res[m.key] ?? 0;
                  const ok = have >= m.qty;
                  return (
                    <span
                      key={m.key}
                      title={ok ? undefined : `Il te manque ${m.qty - have}`}
                      className={`inline-flex items-center gap-1 rounded px-1 ${
                        ok
                          ? 'text-[var(--color-ink)]'
                          : 'bg-[var(--color-ember)]/15 font-semibold text-[var(--color-ember)] ring-1 ring-[var(--color-ember)]/40'
                      }`}
                    >
                      <ResourceIcon resKey={m.key} />{' '}
                      <span className="tabular-nums">
                        {have}/{m.qty}
                      </span>
                    </span>
                  );
                })}
              </span>
            </div>
            <p className="mt-1 text-[10px] text-[var(--color-muted)]/70">
              Un échec fait reculer l'objet d'un niveau.
            </p>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={onUpgradeOnce}
              disabled={busy || !affordable}
              className="btn btn-primary text-sm"
            >
              Améliorer
            </button>
            <div className="flex items-center gap-1 text-xs text-[var(--color-muted)]">
              Auto jusqu'à
              <select
                value={target}
                onChange={(e) => setTarget(Number(e.target.value))}
                disabled={running}
                className="rounded border border-[var(--color-edge)] bg-[var(--color-panel)] px-1 py-0.5 text-[var(--color-ink)]"
              >
                {Array.from({ length: UPGRADE_MAX }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    +{n}
                  </option>
                ))}
              </select>
            </div>
            {running ? (
              <button onClick={onStop} className="btn btn-ghost text-sm">
                ⏹ Stop
              </button>
            ) : (
              <button
                onClick={onAuto}
                disabled={busy || !affordable}
                className="btn btn-arcane text-sm"
              >
                <UiIcon name="auto" size={14} color="currentColor" /> Auto
              </button>
            )}
          </div>
        </>
      )}

      {blessable && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/[0.06] p-3 text-xs">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="font-display text-sm font-semibold text-red-300">Bénédiction</span>
            <span className="flex items-center gap-2">
              <BlessingStars level={item.blessing_level} size={12} />
              <span className="tabular-nums text-[var(--color-muted)]">+{item.blessing_level}/10</span>
            </span>
          </div>
          <p className="mb-2 text-[10px] text-[var(--color-muted)]/80">
            Amplifie le dégât de type de l'arme. Plafonnée par le renforcement ; une arme bénie ne peut plus être renforcée.
          </p>
          {blessCheck.ok ? (
            <div className="flex items-center justify-between gap-2">
              <span className="flex flex-wrap items-center gap-1">
                <span
                  className={`inline-flex items-center gap-1 rounded px-1 ${
                    gold >= blessRecipe.gold
                      ? 'text-[var(--color-ink)]'
                      : 'bg-[var(--color-ember)]/15 font-semibold text-[var(--color-ember)] ring-1 ring-[var(--color-ember)]/40'
                  }`}
                >
                  <UiIcon name="gold" size={12} /> {blessRecipe.gold}
                </span>
                {blessRecipe.materials.map((m) => {
                  const have = res[m.key] ?? 0;
                  const ok = have >= m.qty;
                  return (
                    <span
                      key={m.key}
                      title={ok ? undefined : `Il te manque ${m.qty - have}`}
                      className={`inline-flex items-center gap-1 rounded px-1 ${
                        ok
                          ? 'text-[var(--color-ink)]'
                          : 'bg-[var(--color-ember)]/15 font-semibold text-[var(--color-ember)] ring-1 ring-[var(--color-ember)]/40'
                      }`}
                    >
                      <ResourceIcon resKey={m.key} />{' '}
                      <span className="tabular-nums">
                        {have}/{m.qty}
                      </span>
                    </span>
                  );
                })}
              </span>
              <button
                onClick={onBless}
                disabled={blessBusy || !blessAffordable}
                className="btn text-sm"
                style={{ background: '#dc2626', color: 'white' }}
              >
                Bénir
              </button>
            </div>
          ) : (
            <p className="text-[10px] text-[var(--color-muted)]">{blessCheck.reason}</p>
          )}
        </div>
      )}

      {feedback && <p className="mt-3 text-sm text-[var(--color-ink)]/90">{feedback}</p>}
    </div>
  );
}
