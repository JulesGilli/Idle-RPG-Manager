import { useMemo, useState } from 'react';
import { arcMaterialKey } from '@shared/progression/arcMaterials';
import { scaleRecipeForArc } from '@shared/progression/arc';
import { useArc } from '@/features/arc/useArc';
import { useItems, type ItemRow } from '@/features/heroes/useItems';
import { useHeroes } from '@/features/heroes/useHeroes';
import { useResources, resourceMeta } from '@/hooks/useResources';
import { zoneFarmMaterial } from '@shared/progression/forge';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { SyntyImg } from '@/components/synty/SyntyIcon';
import { UiIcon, PassiveIcon } from '@/components/synty/GameIcons';
import { ZoneUpgradeStars } from '@/components/ItemStars';
import { PassiveStackNotice } from '@/components/PassiveStackNotice';
import { materialZone } from '@/lib/itemZone';
import { MAP_ART, type UiIconName } from '@/lib/synty';
import { MasteryBar } from '@/features/forge/craftUi';
import { UpgradeStudio } from '@/features/forge/UpgradeStudio';
import { useProfile } from '@/hooks/useProfile';
import { rarityMeta } from '@/lib/gameUi';
import {
  gemByPassive,
  jewelLevelInfo,
  refinedJewelPct,
  refineCost,
  refineSuccessChance,
  MAX_JEWEL_LEVEL,
  REFINE_MAX,
} from '@shared/progression/jewelry';
import { useForge } from '@/features/forge/useForge';
import { JewelStudio } from './JewelStudio';
import { TransmuteStudio } from './TransmuteStudio';
import { BackToVillage } from '@/components/BackToVillage';
import { JewelScene } from './JewelScene';

export function JewelryScreen() {
  const [tab, setTab] = useState<'craft' | 'refine' | 'set' | 'transmute'>('craft');
  const { data: profile } = useProfile();
  const jewel = jewelLevelInfo(profile?.jewel_xp ?? 0);
  return (
    <section className="anim-fade space-y-5">
      <BackToVillage />
      <div className="panel relative overflow-hidden p-0">
        <JewelScene />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/45 to-transparent p-5">
          <h2 className="heading flex items-center gap-2 text-2xl">
            <SyntyImg src={MAP_ART.treasure} size={26} />
            Joaillerie
          </h2>
          <p className="max-w-xl text-sm text-white/80">
            Sertis des bijoux (composant de zone + gemme de boss), puis raffine leur passif.
          </p>
          {/* Maîtrise de joaillerie : plus le niveau monte, meilleures sont les raretés. */}
          <MasteryBar icon="jewel" info={jewel} maxLevel={MAX_JEWEL_LEVEL} />
        </div>
      </div>
      {/* Trois onglets et non deux : un bijou de SET n'a pas de passif, il porte
          des stats brutes. Il relève donc du RENFORCEMENT, pas du raffinage —
          deux mécaniques et deux coûts différents, qu'on ne mélange pas dans une
          même liste. Sans cet onglet, ces bijoux n'étaient améliorables nulle
          part : ni ici (pas de passif), ni à la Forge (elle refuse les bijoux). */}
      <div className="flex flex-wrap gap-2">
        <TabBtn active={tab === 'craft'} onClick={() => setTab('craft')} icon="jewel" label="Sertir" />
        <TabBtn active={tab === 'refine'} onClick={() => setTab('refine')} icon="refine" label="Raffiner" />
        <TabBtn active={tab === 'set'} onClick={() => setTab('set')} icon="craft" label="Renforcer (set)" />
        <TabBtn
          active={tab === 'transmute'}
          onClick={() => setTab('transmute')}
          icon="jewel"
          label="Transmuter"
        />
      </div>
      {/* Uniquement là où un passif se paie : « Renforcer » et « Transmuter » ne
          touchent pas aux passifs (stats brutes / échange de gemmes). */}
      {(tab === 'craft' || tab === 'refine') && <PassiveStackNotice />}
      {tab === 'craft' ? (
        <CraftJewelTab />
      ) : tab === 'refine' ? (
        <RefineTab />
      ) : tab === 'transmute' ? (
        <TransmuteStudio />
      ) : (
        <UpgradeStudio
          itemTypes={['jewel']}
          only={(i) => Boolean(i.set_id)}
          masteryLevel={jewel.level}
          emptyLabel="Aucun bijou de set à renforcer — forge-en un dans l'onglet Sertir."
        />
      )}
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
  return <JewelStudio />;
}

/* ---------------------------------------------------------------- RAFFINER */

function RefineTab() {
  const { data: items } = useItems();
  const { data: heroes } = useHeroes();
  const { data: resources } = useResources();
  const { data: profile } = useProfile();
  const { refineJewel } = useForge();
  const { currentArc } = useArc();

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
  const [feedback, setFeedback] = useState<string | null>(null);

  // Filtre par ARC courant, comme le renforcement : un bijou d'un autre arc
  // n'a rien à faire dans la liste de raffinage.
  const jewels = (items ?? []).filter(
    (i) => i.item_type === 'jewel' && i.passive_type && (i.tier ?? 1) === currentArc,
  );
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
              className={`mb-1 flex w-full flex-col gap-1 rounded-lg px-3 py-2 text-left text-sm transition ${
                selectedId === item.id ? 'bg-[var(--color-arcane)]/15' : 'hover:bg-white/[0.04]'
              }`}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <UiIcon name="jewel" size={16} />
                  <span className={`truncate ${meta.text}`}>{item.name}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-[10px] text-[var(--color-arcane)]">
                  {item.passive_type && <PassiveIcon passive={item.passive_type} size={11} />}{' '}
                  {item.passive_value}% · +{item.upgrade_level}
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

      {/* Détail / raffinage */}
      <div className="panel p-4">
        {!selected ? (
          <p className="text-sm text-[var(--color-muted)]">Sélectionne un bijou à gauche.</p>
        ) : (
          <RefineDetail
            item={selected}
            wearer={equippedBy.get(selected.id)}
            masteryLevel={jewelLevelInfo(profile?.jewel_xp ?? 0).level}
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
  wearer,
  gold,
  res,
  feedback,
  busy,
  onRefine,
  masteryLevel,
}: {
  item: ItemRow;
  wearer: string | undefined;
  gold: number;
  res: Record<string, number>;
  feedback: string | null;
  busy: boolean;
  /** Niveau de joaillerie — bonifie la réussite, comme à la forge. */
  masteryLevel: number;
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
  // Coût = matériau de farm de la zone du bijou (déduit de son suffixe) + 1 gemme du passif.
  // `materialZone` = même déduction que l'inventaire/forge.
  const zone = materialZone(item);
  // Traduit dans l'arc DE L'OBJET (son ), et passé par forgeCostMult —
  // exactement ce que fait le serveur. Sans ça, raffiner un bijou d'arc 2
  // annonçait le matériau et la gemme d'ARC 1, que le joueur ne possède pas.
  const itemArc = Math.max(1, item.tier ?? 1);
  const matKey = arcMaterialKey(zoneFarmMaterial(zone || 1), itemArc);
  const gemKey = arcMaterialKey(gem.id, itemArc);
  const cost = scaleRecipeForArc(refineCost(item.upgrade_level, matKey, gemKey), itemArc);
  const matQty = cost.materials[0]?.qty ?? 0;
  const gemQty = 1;
  // Maîtrise ET acharnement bonifient la réussite — même calcul qu'au serveur,
  // et chaque apport est mesuré en marginal (cf. UpgradeStudio).
  const fails = item.upgrade_fails ?? 0;
  const baseSuccess = Math.round(refineSuccessChance(item.upgrade_level) * 100);
  const masterySuccess = Math.round(refineSuccessChance(item.upgrade_level, masteryLevel) * 100);
  const success = Math.round(refineSuccessChance(item.upgrade_level, masteryLevel, fails) * 100);
  const masteryGain = masterySuccess - baseSuccess;
  const pityGain = success - masterySuccess;
  const matOwned = res[matKey] ?? 0;
  const gemOwned = res[gemKey] ?? 0;
  const affordable = gold >= cost.gold && matOwned >= matQty && gemOwned >= gemQty;

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className={`font-display text-lg font-semibold ${meta.text}`}>{item.name}</span>
        <span className="chip bg-white/5 text-[var(--color-muted)]">
          Raffinage +{item.upgrade_level}/{REFINE_MAX}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ZoneUpgradeStars zone={zone} upgrade={item.upgrade_level} size={14} />
        <span className="text-[10px] text-[var(--color-muted)]">Zone {zone || '?'}/10</span>
        {wearer && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-gold-soft)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-gold-soft)]">
            <UiIcon name="squad" size={11} color="currentColor" /> Équipé par {wearer}
          </span>
        )}
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
                    title={`${fails} échec${fails > 1 ? 's' : ''} d'affilée sur ce bijou : +${pityGain} points sur cette tentative. Remis à zéro à la première réussite.`}
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
            <div className="flex justify-between">
              <span className="text-[var(--color-muted)]">Coût</span>
              <span
                className={`inline-flex flex-wrap items-center justify-end gap-x-1 gap-y-0.5 ${
                  gold >= cost.gold ? 'text-[var(--color-ink)]' : 'text-[var(--color-ember)]'
                }`}
              >
                <UiIcon name="gold" size={12} /> {cost.gold}
                <span
                  className={`inline-flex items-center gap-1 ${
                    matOwned >= matQty ? '' : 'text-[var(--color-ember)]'
                  }`}
                >
                  {' '}
                  · <ResourceIcon resKey={matKey} size={12} /> {resourceMeta(matKey).label} {matQty}/
                  {matOwned}
                </span>
                <span
                  className={`inline-flex items-center gap-1 ${
                    gemOwned >= gemQty ? '' : 'text-[var(--color-ember)]'
                  }`}
                >
                  {' '}
                  · <ResourceIcon resKey={gemKey} size={12} /> {resourceMeta(gemKey).label} {gemQty}/{gemOwned}
                </span>
              </span>
            </div>
            <p className="mt-1 text-[10px] text-[var(--color-muted)]/70">
              Un échec fait reculer le raffinage d'un niveau (or, matériau et gemme sont consommés).
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
