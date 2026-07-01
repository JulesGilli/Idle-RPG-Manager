import { useRef, useState } from 'react';
import { useItems, type ItemRow } from '@/features/heroes/useItems';
import { useResources, resourceMeta } from '@/hooks/useResources';
import { useProfile } from '@/hooks/useProfile';
import { rarityMeta } from '@/lib/gameUi';
import {
  CRAFT_RECIPES,
  upgradeCost,
  upgradeSuccessChance,
  UPGRADE_MAX,
  type Recipe,
} from '@shared/progression/forge';
import { useForge } from './useForge';

const TYPE_ICON: Record<string, string> = { weapon: '🗡️', armor: '🛡️', jewel: '💍', relic: '🔮' };

export function ForgeScreen() {
  const [tab, setTab] = useState<'craft' | 'upgrade'>('craft');
  return (
    <section className="anim-fade space-y-5">
      <div>
        <h2 className="heading text-2xl">⚒️ Forge</h2>
        <p className="text-sm text-[var(--color-muted)]">
          Fabrique des armes et armures, puis améliore-les.
        </p>
      </div>
      <div className="flex gap-2">
        <TabBtn active={tab === 'craft'} onClick={() => setTab('craft')} label="🔨 Fabriquer" />
        <TabBtn active={tab === 'upgrade'} onClick={() => setTab('upgrade')} label="✨ Améliorer" />
      </div>
      {tab === 'craft' ? <CraftTab /> : <UpgradeTab />}
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

/* ------------------------------------------------------------------ CRAFT */

function CraftTab() {
  const { data: resources } = useResources();
  const { data: profile } = useProfile();
  const { craft } = useForge();
  const [itemType, setItemType] = useState<'weapon' | 'armor'>('weapon');

  const gold = profile?.gold ?? 0;
  const res = resources ?? {};

  function affordable(recipe: Recipe): boolean {
    if (gold < recipe.gold) return false;
    return recipe.materials.every((m) => (res[m.key] ?? 0) >= m.qty);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(['weapon', 'armor'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setItemType(t)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition ${
              itemType === t
                ? 'border-[var(--color-arcane)] bg-[var(--color-arcane)]/15 text-white'
                : 'border-[var(--color-edge)] text-[var(--color-muted)] hover:border-white/25'
            }`}
          >
            {TYPE_ICON[t]} {t === 'weapon' ? 'Arme' : 'Armure'}
          </button>
        ))}
      </div>

      {craft.isError && (
        <p className="text-sm text-[var(--color-ember)]">
          {craft.error instanceof Error ? craft.error.message : 'Erreur'}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {CRAFT_RECIPES.map((recipe) => {
          const ok = affordable(recipe);
          const oddsTotal = Object.values(recipe.rarityWeights).reduce((s, w) => s + (w ?? 0), 0);
          return (
            <div key={recipe.id} className="panel p-4">
              <div className="flex items-center justify-between">
                <span className="font-display font-semibold text-[var(--color-ink)]">
                  {recipe.label}
                </span>
                <span className="chip bg-[var(--color-gold)]/15 text-[var(--color-gold-soft)]">
                  💰 {recipe.gold}
                </span>
              </div>

              <ul className="mt-2 space-y-1 text-xs">
                {recipe.materials.map((m) => {
                  const have = res[m.key] ?? 0;
                  const enough = have >= m.qty;
                  return (
                    <li
                      key={m.key}
                      className={
                        enough ? 'text-[var(--color-ink)]/80' : 'text-[var(--color-ember)]'
                      }
                    >
                      {resourceMeta(m.key).icon} {resourceMeta(m.key).label} : {have}/{m.qty}
                    </li>
                  );
                })}
              </ul>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.entries(recipe.rarityWeights).map(([rarity, w]) => {
                  const meta = rarityMeta(rarity);
                  return (
                    <span key={rarity} className={`chip bg-white/5 ${meta.text}`}>
                      {meta.label} {Math.round(((w ?? 0) / oddsTotal) * 100)}%
                    </span>
                  );
                })}
              </div>

              <button
                onClick={() => craft.mutate({ itemType, recipeId: recipe.id })}
                disabled={!ok || craft.isPending}
                className="btn btn-primary mt-3 w-full text-sm"
              >
                {craft.isPending ? 'Forge…' : 'Forger (rareté aléatoire)'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- UPGRADE */

function UpgradeTab() {
  const { data: items } = useItems();
  const { data: resources } = useResources();
  const { data: profile } = useProfile();
  const { upgrade } = useForge();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [target, setTarget] = useState(10);
  const [running, setRunning] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const stopRef = useRef(false);

  const list = items ?? [];
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
          const meta = rarityMeta(item.rarity);
          return (
            <button
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              className={`mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                selectedId === item.id ? 'bg-[var(--color-arcane)]/15' : 'hover:bg-white/[0.04]'
              }`}
            >
              <span className="flex items-center gap-2">
                <span>{TYPE_ICON[item.item_type] ?? '❔'}</span>
                <span className={`truncate ${meta.text}`}>{item.name}</span>
              </span>
              <span className="text-[10px] text-[var(--color-muted)]">
                T{item.tier} · +{item.upgrade_level}
              </span>
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
                onSuccess: (r) => setFeedback(r.success ? '✅ Réussite !' : '❌ Échec — niveau -1'),
                onError: (e) => setFeedback(e instanceof Error ? e.message : 'Erreur'),
              });
            }}
            onAuto={() => runAuto(selected)}
            onStop={() => (stopRef.current = true)}
            busy={upgrade.isPending || running}
          />
        )}
      </div>
    </div>
  );
}

function UpgradeDetail({
  item,
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
}: {
  item: ItemRow;
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
}) {
  const meta = rarityMeta(item.rarity);
  const maxed = item.upgrade_level >= UPGRADE_MAX;
  const cost = upgradeCost(item.upgrade_level);
  const success = Math.round(upgradeSuccessChance(item.upgrade_level) * 100);
  const affordable = canAfford(cost);

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className={`font-display text-lg font-semibold ${meta.text}`}>{item.name}</span>
        <span className="chip bg-white/5 text-[var(--color-muted)]">
          Tier {item.tier} · Niv. +{item.upgrade_level}/{UPGRADE_MAX}
        </span>
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
        <p className="mt-4 text-sm text-[var(--color-gold-soft)]">Niveau maximum atteint 🏆</p>
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
            <div className="flex justify-between">
              <span className="text-[var(--color-muted)]">Coût</span>
              <span
                className={
                  gold >= cost.gold ? 'text-[var(--color-ink)]' : 'text-[var(--color-ember)]'
                }
              >
                💰 {cost.gold}
                {cost.materials.map((m) => (
                  <span
                    key={m.key}
                    className={(res[m.key] ?? 0) >= m.qty ? '' : 'text-[var(--color-ember)]'}
                  >
                    {' '}
                    · {resourceMeta(m.key).icon} {m.qty}
                  </span>
                ))}
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
                ⚙️ Auto
              </button>
            )}
          </div>
        </>
      )}

      {feedback && <p className="mt-3 text-sm text-[var(--color-ink)]/90">{feedback}</p>}
    </div>
  );
}
