import { useRef, useState } from 'react';
import { useItems, type ItemRow } from '@/features/heroes/useItems';
import { useResources, resourceMeta } from '@/hooks/useResources';
import { useProfile } from '@/hooks/useProfile';
import { rarityMeta } from '@/lib/gameUi';
import {
  FORGE_BASES,
  FORGE_MATERIALS,
  CRAFT_RARITY_WEIGHTS,
  ZONES_PER_CRAFT_TIER,
  unlockedCraftTier,
  craftRanges,
  upgradeCost,
  upgradeSuccessChance,
  UPGRADE_MAX,
  type Recipe,
  type ForgeBase,
  type ForgeMaterialTheme,
} from '@shared/progression/forge';
import { RELIC_BASES, relicRecipe, relicRanges } from '@shared/progression/relic';
import { useMaps, useLevelProgress } from '@/features/maps/useMaps';
import { useForge, type CraftedItem } from './useForge';
import { SyntyImg } from '@/components/synty/SyntyIcon';
import { RarityFrame } from '@/components/synty/RarityFrame';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { forgeBaseUrl, rarityHex } from '@/lib/synty';

const TYPE_ICON: Record<string, string> = { weapon: '🗡️', armor: '🛡️', jewel: '💍', relic: '🔮' };

export function ForgeScreen() {
  const [tab, setTab] = useState<'craft' | 'upgrade' | 'relic'>('craft');
  return (
    <section className="anim-fade space-y-5">
      <div>
        <h2 className="heading text-2xl">⚒️ Forge</h2>
        <p className="text-sm text-[var(--color-muted)]">
          Fabrique des armes et armures, forge des reliques avec le butin de donjon, puis
          renforce-les. Les bijoux se travaillent à la Joaillerie.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <TabBtn active={tab === 'craft'} onClick={() => setTab('craft')} label="🔨 Fabriquer" />
        <TabBtn active={tab === 'relic'} onClick={() => setTab('relic')} label="🗿 Reliques" />
        <TabBtn active={tab === 'upgrade'} onClick={() => setTab('upgrade')} label="✨ Renforcer" />
      </div>
      {tab === 'craft' ? <CraftTab /> : tab === 'relic' ? <RelicTab /> : <UpgradeTab />}
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

const WEIGHT_LABEL: Record<string, string> = {
  light: 'Léger',
  medium: 'Moyen',
  heavy: 'Lourd',
};

function CraftTab() {
  const { data: resources } = useResources();
  const { data: profile } = useProfile();
  const { data: maps } = useMaps();
  const { data: cleared } = useLevelProgress();
  const { craft } = useForge();
  const [itemType, setItemType] = useState<'weapon' | 'armor'>('weapon');
  const [baseId, setBaseId] = useState<string>('grande_epee');
  const [materialId, setMaterialId] = useState<string>('chene');
  const [lastCrafted, setLastCrafted] = useState<CraftedItem | null>(null);
  const [lastBaseId, setLastBaseId] = useState<string>('grande_epee');

  const gold = profile?.gold ?? 0;
  const res = resources ?? {};

  // Zones terminées = boss battus → tier de craft débloqué.
  const clearedSet = cleared ?? new Set<string>();
  const zonesCompleted = (maps ?? [])
    .flatMap((m) => m.levels)
    .filter((l) => l.isBoss && clearedSet.has(l.id)).length;
  const craftTier = unlockedCraftTier(zonesCompleted);

  const bases = FORGE_BASES.filter((b) => b.itemType === itemType);
  const base = bases.find((b) => b.id === baseId) ?? bases[0]!;
  const materials = [...FORGE_MATERIALS].sort(
    (a, b) => a.craftTier - b.craftTier || a.zone - b.zone,
  );
  const mat = materials.find((m) => m.id === materialId) ?? materials[0]!;
  const ranges = craftRanges(base, mat);

  function affordable(m: ForgeMaterialTheme): boolean {
    if (gold < m.gold) return false;
    return m.materials.every((x) => (res[x.key] ?? 0) >= x.qty);
  }

  function selectType(t: 'weapon' | 'armor') {
    setItemType(t);
    const first = FORGE_BASES.find((b) => b.itemType === t);
    if (first) setBaseId(first.id);
  }

  const oddsTotal = Object.values(CRAFT_RARITY_WEIGHTS).reduce((s, w) => s + w, 0);
  const craftName = `${base.label} ${mat.suffix}`;
  const ok = affordable(mat) && mat.craftTier <= craftTier;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(['weapon', 'armor'] as const).map((t) => (
          <button
            key={t}
            onClick={() => selectType(t)}
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

      {/* Choix du modèle d'objet */}
      <div>
        <div className="mb-2 text-sm font-medium text-[var(--color-muted)]">Modèle</div>
        <div className="flex flex-wrap gap-2">
          {bases.map((b: ForgeBase) => (
            <button
              key={b.id}
              onClick={() => setBaseId(b.id)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition ${
                base.id === b.id
                  ? 'border-[var(--color-arcane)] bg-[var(--color-arcane)]/15 text-white'
                  : 'border-[var(--color-edge)] bg-black/20 text-[var(--color-muted)] hover:border-white/25'
              }`}
            >
              <SyntyImg src={forgeBaseUrl(b.id)} size={18} title={b.label} />
              {b.label}
              <span className="text-[10px] text-[var(--color-muted)]">
                {WEIGHT_LABEL[b.weight]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Composants — triés par tier de craft puis par zone */}
      <div>
        <div className="mb-2 text-sm font-medium text-[var(--color-muted)]">
          ⚒️ Tier de craft 1 · composants des zones 1 à {ZONES_PER_CRAFT_TIER}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {materials
            .filter((m) => m.craftTier === 1)
            .map((m) => {
              const can = affordable(m);
              const active = mat.id === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setMaterialId(m.id)}
                  className={`panel p-3 text-left transition ${
                    active ? 'ring-2 ring-[var(--color-arcane)]' : 'hover:border-white/25'
                  } ${can ? '' : 'opacity-60'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display text-sm font-semibold text-[var(--color-ink)]">
                      {m.label}
                    </span>
                    <span className="chip bg-white/5 text-[10px] text-[var(--color-muted)]">
                      Zone {m.zone}
                    </span>
                  </div>
                  <div
                    className={`mt-1 text-xs ${
                      gold >= m.gold
                        ? 'text-[var(--color-gold-soft)]'
                        : 'text-[var(--color-ember)]'
                    }`}
                  >
                    💰 {m.gold}
                  </div>
                  <ul className="mt-1 space-y-0.5 text-xs">
                    {m.materials.map((x) => {
                      const have = res[x.key] ?? 0;
                      const enough = have >= x.qty;
                      return (
                        <li
                          key={x.key}
                          className={`flex items-center gap-1 ${
                            enough ? 'text-[var(--color-ink)]/80' : 'text-[var(--color-ember)]'
                          }`}
                        >
                          <ResourceIcon resKey={x.key} />
                          {resourceMeta(x.key).label} : {have}/{x.qty}
                        </li>
                      );
                    })}
                  </ul>
                </button>
              );
            })}
        </div>

        {/* Palier suivant, verrouillé tant que les 10 zones ne sont pas finies */}
        <div className="mt-3 rounded-lg border border-dashed border-[var(--color-edge)] bg-black/20 p-3 text-xs text-[var(--color-muted)]">
          🔒 Tier de craft 2 — termine les {ZONES_PER_CRAFT_TIER} zones pour le débloquer (
          {zonesCompleted}/{ZONES_PER_CRAFT_TIER} boss vaincus). Zones 11-20 à venir.
        </div>
      </div>

      {/* Aperçu du craft : nom + range de stats possible */}
      <div className="rounded-lg border border-[var(--color-edge)] bg-black/20 p-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-display text-sm font-semibold text-[var(--color-ink)]">
            <SyntyImg src={forgeBaseUrl(base.id)} size={20} title={base.label} />
            {craftName}
          </span>
          <span className="chip bg-white/5 text-[10px] text-[var(--color-muted)]">
            {WEIGHT_LABEL[base.weight]} · Tier {mat.craftTier}
          </span>
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          {ranges.atk[1] > 0 && (
            <span className="text-[var(--color-ink)]/85">
              ⚔️ ATK {ranges.atk[0]}–{ranges.atk[1]}
            </span>
          )}
          {ranges.def[1] > 0 && (
            <span className="text-[var(--color-ink)]/85">
              🛡️ DEF {ranges.def[0]}–{ranges.def[1]}
            </span>
          )}
          {ranges.hp[1] > 0 && (
            <span className="text-[var(--color-ink)]/85">
              ❤️ PV {ranges.hp[0]}–{ranges.hp[1]}
            </span>
          )}
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
        <p className="mt-2 text-[10px] text-[var(--color-muted)]/70">
          Le composant fixe la puissance et le thème (givre → DEF, obsidienne → ATK, abysses →
          PV…). La rareté ne fait que moduler la qualité de −20 % (Médiocre) à +35 % (Ultime) ; la
          range ci-dessus couvre donc exactement ces deux extrêmes. Les % de rareté sont identiques
          pour tous les crafts.
        </p>
      </div>

      {craft.isError && (
        <p className="text-sm text-[var(--color-ember)]">
          {craft.error instanceof Error ? craft.error.message : 'Erreur'}
        </p>
      )}

      <button
        onClick={() => {
          const craftedBaseId = base.id;
          setLastCrafted(null);
          craft.mutate(
            { baseId: craftedBaseId, materialId: mat.id },
            {
              onSuccess: (r) => {
                setLastCrafted(r.item);
                setLastBaseId(craftedBaseId);
              },
            },
          );
        }}
        disabled={!ok || craft.isPending}
        className="btn btn-primary w-full text-sm"
      >
        {craft.isPending ? 'Forge…' : `🔨 Forger : ${craftName}`}
      </button>

      {lastCrafted && (
        <RarityFrame color={rarityHex(lastCrafted.rarity)} className="anim-pop">
          <div className="flex items-center justify-between gap-3 rounded-[0.9rem] bg-gradient-to-b from-[var(--color-panel-2)] to-[var(--color-panel)] p-3 text-sm">
            <span className="flex items-center gap-2">
              <SyntyImg src={forgeBaseUrl(lastBaseId)} size={28} title={lastCrafted.name} />
              <span className={`font-display font-semibold ${rarityMeta(lastCrafted.rarity).text}`}>
                {lastCrafted.name}
              </span>
              <span className="text-[10px] text-[var(--color-muted)]">T{lastCrafted.tier}</span>
            </span>
            <span className="text-xs text-[var(--color-muted)]">
              {[
                lastCrafted.atk_bonus ? `+${lastCrafted.atk_bonus} ATK` : null,
                lastCrafted.def_bonus ? `+${lastCrafted.def_bonus} DEF` : null,
                lastCrafted.hp_bonus ? `+${lastCrafted.hp_bonus} PV` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
        </RarityFrame>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ RELIC */

function RelicTab() {
  const { data: resources } = useResources();
  const { data: profile } = useProfile();
  const { craftRelic } = useForge();
  const [baseId, setBaseId] = useState<string>(RELIC_BASES[0]!.id);
  const [lastCrafted, setLastCrafted] = useState<CraftedItem | null>(null);

  const gold = profile?.gold ?? 0;
  const res = resources ?? {};
  const base = RELIC_BASES.find((b) => b.id === baseId) ?? RELIC_BASES[0]!;
  const recipe = relicRecipe(base);
  const ranges = relicRanges(base);

  const enoughGold = gold >= recipe.gold;
  const ok = enoughGold && recipe.materials.every((m) => (res[m.key] ?? 0) >= m.qty);

  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--color-muted)]">
        Les reliques se forgent avec le butin des donjons. Stats brutes (grosse composante PV),
        rareté à % globaux (−20 % Médiocre → +35 % Ultime). Pas de passif — c'est le domaine des
        bijoux.
      </p>

      {/* Choix du modèle */}
      <div className="flex flex-wrap gap-2">
        {RELIC_BASES.map((b) => (
          <button
            key={b.id}
            onClick={() => setBaseId(b.id)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition ${
              base.id === b.id
                ? 'border-[var(--color-arcane)] bg-[var(--color-arcane)]/15 text-white'
                : 'border-[var(--color-edge)] bg-black/20 text-[var(--color-muted)] hover:border-white/25'
            }`}
          >
            <span>{b.icon}</span> {b.label}
          </button>
        ))}
      </div>

      {/* Aperçu : stats possibles + coût */}
      <div className="rounded-lg border border-[var(--color-edge)] bg-black/20 p-3">
        <div className="mb-1 font-display text-sm font-semibold text-[var(--color-ink)]">
          {base.icon} {base.label}
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          {ranges.atk[1] > 0 && (
            <span className="text-[var(--color-ink)]/85">
              ⚔️ ATK {ranges.atk[0]}–{ranges.atk[1]}
            </span>
          )}
          {ranges.def[1] > 0 && (
            <span className="text-[var(--color-ink)]/85">
              🛡️ DEF {ranges.def[0]}–{ranges.def[1]}
            </span>
          )}
          {ranges.hp[1] > 0 && (
            <span className="text-[var(--color-ink)]/85">
              ❤️ PV {ranges.hp[0]}–{ranges.hp[1]}
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className={enoughGold ? 'text-[var(--color-gold-soft)]' : 'text-[var(--color-ember)]'}>
            💰 {recipe.gold}
          </span>
          {recipe.materials.map((m) => {
            const have = res[m.key] ?? 0;
            const enough = have >= m.qty;
            return (
              <span
                key={m.key}
                className={`inline-flex items-center gap-1 ${
                  enough ? 'text-[var(--color-ink)]/80' : 'text-[var(--color-ember)]'
                }`}
              >
                <ResourceIcon resKey={m.key} /> {resourceMeta(m.key).label} : {have}/{m.qty}
              </span>
            );
          })}
        </div>
      </div>

      {craftRelic.isError && (
        <p className="text-sm text-[var(--color-ember)]">
          {craftRelic.error instanceof Error ? craftRelic.error.message : 'Erreur'}
        </p>
      )}

      <button
        onClick={() => {
          setLastCrafted(null);
          craftRelic.mutate({ baseId: base.id }, { onSuccess: (r) => setLastCrafted(r.item) });
        }}
        disabled={!ok || craftRelic.isPending}
        className="btn btn-primary w-full text-sm"
      >
        {craftRelic.isPending ? 'Forge…' : `🗿 Forger : ${base.label}`}
      </button>

      {lastCrafted && (
        <RarityFrame color={rarityHex(lastCrafted.rarity)} className="anim-pop">
          <div className="flex items-center justify-between gap-3 rounded-[0.9rem] bg-gradient-to-b from-[var(--color-panel-2)] to-[var(--color-panel)] p-3 text-sm">
            <span className="flex items-center gap-2">
              <span className="text-lg">🔮</span>
              <span className={`font-display font-semibold ${rarityMeta(lastCrafted.rarity).text}`}>
                {lastCrafted.name}
              </span>
            </span>
            <span className="text-xs text-[var(--color-muted)]">
              {[
                lastCrafted.atk_bonus ? `+${lastCrafted.atk_bonus} ATK` : null,
                lastCrafted.def_bonus ? `+${lastCrafted.def_bonus} DEF` : null,
                lastCrafted.hp_bonus ? `+${lastCrafted.hp_bonus} PV` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
        </RarityFrame>
      )}
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
                    className={`inline-flex items-center gap-1 ${
                      (res[m.key] ?? 0) >= m.qty ? '' : 'text-[var(--color-ember)]'
                    }`}
                  >
                    {' · '}
                    <ResourceIcon resKey={m.key} /> {m.qty}
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
