import { useMemo, useRef, useState } from 'react';
import { scaleRecipeForArc } from '@shared/progression/arc';
import { arcMaterialKey } from '@shared/progression/arcMaterials';
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
import { useForge } from './useForge';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { UiIcon, EquipmentIcon } from '@/components/synty/GameIcons';
import { ZoneUpgradeStars } from '@/components/ItemStars';
import { RarityBadge } from '@/components/RarityBadge';
import { materialZone } from '@/lib/itemZone';

/**
 * ATELIER DE RENFORCEMENT — partagé par la Forge (armes/armures) et l'Autel
 * (reliques). Chaque atelier renforce SES types d'objets, avec SA maîtrise :
 * un maître forgeron rate moins ses renforcements qu'un novice.
 *
 * La BÉNÉDICTION n'est plus ici : elle a son bâtiment (l'Oratoire Astral). Elle
 * est l'exact contraire du renforcement — elle gèle le métal pour amplifier le
 * type — et elle n'avait rien à faire en encadré sous les boutons. Ce qui reste :
 * dire pourquoi une arme bénie ne se renforce plus.
 */

export function UpgradeStudio({
  itemTypes,
  masteryLevel,
  emptyLabel,
  only,
}: {
  /** Types d'objets que CET atelier renforce (forge : arme/armure ; autel : relique). */
  itemTypes: readonly string[];
  /** Niveau de la maîtrise de l'atelier — bonifie la réussite. */
  masteryLevel: number;
  emptyLabel: string;
  /**
   * Filtre supplémentaire. Sert à la Joaillerie, qui ne renforce que les bijoux
   * de SET : les bijoux classiques n'ont pas de stats brutes, ils se raffinent.
   */
  only?: (item: ItemRow) => boolean;
}) {
  const { data: items } = useItems();
  const { data: heroes } = useHeroes();
  const { data: resources } = useResources();
  const { data: profile } = useProfile();
  const { upgrade } = useForge();

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

  // Chaque atelier ne renforce QUE ses types : la forge ne doit pas proposer les
  // reliques (c'est l'autel), ni les bijoux (ils n'ont pas de stats brutes — la
  // joaillerie les raffine).
  const list = (items ?? []).filter(
    (i) => itemTypes.includes(i.item_type) && (!only || only(i)),
  );
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
        {list.length === 0 && <p className="p-3 text-sm text-[var(--color-muted)]">{emptyLabel}</p>}
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
                  <RarityBadge rarity={item.rarity} compact />
                  <span className="truncate" style={{ color: rarityColor(item.rarity) }}>
                    {item.name}
                  </span>
                </span>
                <span className="shrink-0 text-[10px] text-[var(--color-muted)]">
                  T{item.tier} · +{item.upgrade_level}
                </span>
              </span>
              <div className="flex items-center justify-between gap-2">
                <ZoneUpgradeStars
                  zone={materialZone(item)}
                  upgrade={item.upgrade_level}
                  blessing={item.blessing_level}
                  size={11}
                />
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
            masteryLevel={masteryLevel}
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
  masteryLevel,
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
  masteryLevel: number;
}) {
  // Une arme bénie est GELÉE : on ne la renforce plus (verrou serveur côté
  // action `upgrade`). On le dit ici, c'est là que le joueur s'y cogne.
  const blessed = (item.blessing_level ?? 0) > 0;
  const maxed = item.upgrade_level >= UPGRADE_MAX;
  // Matériau consommé = farm de la zone de l'objet (set = zone 10, sinon suffixe).
  // `materialZone` = même déduction que l'inventaire (set → 10, sinon suffixe du nom).
  const zone = materialZone(item);
  // Comme le serveur : matériau TRADUIT dans l'arc de l'objet (une pièce d'arc 2
  // se renforce à l'Écorce pétrifiée, pas à l'Écorce) et coût passé par
  // `forgeCostMult`. L'objet porte son arc dans `tier` — c'est lui qui décide,
  // pas l'arc du visiteur : on peut regarder un objet d'arc 1 depuis l'arc 2.
  const itemArc = Math.max(1, item.tier ?? 1);
  const cost = scaleRecipeForArc(
    upgradeCost(item.upgrade_level, arcMaterialKey(zoneFarmMaterial(zone || 1), itemArc)),
    itemArc,
  );
  // Maîtrise ET acharnement bonifient la réussite — même calcul qu'au serveur.
  // Chaque apport est mesuré en marginal (ce que la ligne ajoute vraiment, une
  // fois le plafond dur appliqué) : un chiffre qui ne s'ajoute pas est un
  // mensonge, et ils se plafonnent l'un l'autre.
  const fails = item.upgrade_fails ?? 0;
  const baseSuccess = Math.round(upgradeSuccessChance(item.upgrade_level) * 100);
  const masterySuccess = Math.round(upgradeSuccessChance(item.upgrade_level, masteryLevel) * 100);
  const success = Math.round(upgradeSuccessChance(item.upgrade_level, masteryLevel, fails) * 100);
  const masteryGain = masterySuccess - baseSuccess;
  const pityGain = success - masterySuccess;
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
        <RarityBadge rarity={item.rarity} />
        {/* La bénédiction est portée par la bande d'étoiles elle-même (contour
            rouge) : un second bandeau rouge à côté afficherait deux fois la
            même chose. */}
        <ZoneUpgradeStars
          zone={zone}
          upgrade={item.upgrade_level}
          blessing={item.blessing_level}
          size={14}
        />
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
              <span className="flex items-center gap-1.5">
                {/* Ce que la maîtrise apporte : sinon le bonus est invisible. */}
                {masteryGain > 0 && (
                  <span
                    className="chip bg-[var(--color-gold-soft)]/15 text-[9px] font-semibold text-[var(--color-gold-soft)]"
                    title={`${baseSuccess}% de base, +${masteryGain} points grâce à ta maîtrise Nv.${masteryLevel}`}
                  >
                    maîtrise +{masteryGain}
                  </span>
                )}
                {/* La série noire doit se VOIR : c'est ce qui fait retenter. */}
                {pityGain > 0 && (
                  <span
                    className="chip bg-[var(--color-arcane)]/15 text-[9px] font-semibold text-[var(--color-arcane)]"
                    title={`${fails} échec${fails > 1 ? 's' : ''} d'affilée sur cet objet : +${pityGain} points sur cette tentative. Remis à zéro à la première réussite.`}
                  >
                    acharnement +{pityGain}
                  </span>
                )}
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

      {feedback && <p className="mt-3 text-sm text-[var(--color-ink)]/90">{feedback}</p>}
    </div>
  );
}
