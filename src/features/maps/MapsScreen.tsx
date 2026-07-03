import { Fragment, useEffect, useRef, useState, type DragEvent } from 'react';
import { useHeroes, type HeroView } from '@/features/heroes/useHeroes';
import {
  useHeroAvailability,
  heroIsBusy,
  HERO_STATUS_LABEL,
  type HeroStatus,
} from '@/features/heroes/useHeroAvailability';
import { CombatReplay, type StoredCombat } from '@/components/CombatReplay';
import { resourceMeta } from '@/hooks/useResources';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { SyntyImg, SyntyGlyph } from '@/components/synty/SyntyIcon';
import { UiIcon, ClassIcon, PassiveIcon } from '@/components/synty/GameIcons';
import { MAP_ART, syntyUrl } from '@/lib/synty';
import { fightsForElapsed, FIGHT_COOLDOWN_SECONDS } from '@shared/progression/deployment';
import { materialDropChance } from '@shared/progression/loot';
import { gemByMap, GEM_DROP_CHANCE } from '@shared/progression/jewelry';
import {
  useMaps,
  useLevelProgress,
  useDeployments,
  type LevelRow,
  type MapRow,
  type DeploymentRow,
} from './useMaps';
import { useDeploymentActions, type FightResponse, type FightRewards } from './useDeploymentActions';

type LevelState = 'cleared' | 'available' | 'locked';

function levelState(level: LevelRow, map: MapRow, cleared: Set<string>): LevelState {
  if (cleared.has(level.id)) return 'cleared';
  if (level.level_index === 1) return 'available';
  const prev = map.levels.find((l) => l.level_index === level.level_index - 1);
  if (prev && cleared.has(prev.id)) return 'available';
  return 'locked';
}

export function MapsScreen() {
  const { data: maps, isLoading: mapsLoading } = useMaps();
  const { data: cleared } = useLevelProgress();
  const { data: deployments } = useDeployments();
  const { data: heroes } = useHeroes();
  const actions = useDeploymentActions();

  const [deployTarget, setDeployTarget] = useState<{ level: LevelRow; map: MapRow } | null>(null);
  const [replay, setReplay] = useState<StoredCombat | null>(null);
  const [fightView, setFightView] = useState<FightResponse | null>(null);
  const [fightError, setFightError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const clearedSet = cleared ?? new Set<string>();
  const heroList = heroes ?? [];
  const deps = deployments ?? [];
  const loopDeps = deps.filter((d) => d.mode === 'loop');
  const mapList = maps ?? [];

  // Horloge live (1 s) pour les combats en attente et le cooldown d'assaut.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deps.length === 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [deps.length]);

  const availability = useHeroAvailability();
  const depByLevel = new Map(deps.map((d) => [d.level_id, d.mode]));

  function heroById(id: string): HeroView | undefined {
    return heroList.find((h) => h.id === id);
  }

  // Sélection de zone : la dernière choisie, sinon la première non terminée, sinon la première.
  const selectedMap =
    mapList.find((m) => m.id === selectedId) ??
    mapList.find((m) => !m.levels.every((l) => clearedSet.has(l.id))) ??
    mapList[0] ??
    null;

  // Récolte automatique silencieuse des groupes en boucle (pas de bouton).
  const claimingRef = useRef(false);
  const doClaim = () => {
    if (claimingRef.current) return;
    claimingRef.current = true;
    actions.claim.mutate(undefined, {
      onSettled: () => {
        claimingRef.current = false;
      },
    });
  };
  const doClaimRef = useRef(doClaim);
  doClaimRef.current = doClaim;

  useEffect(() => {
    if (loopDeps.length === 0) return;
    const run = () => doClaimRef.current();
    run();
    const id = setInterval(run, 45_000);
    return () => clearInterval(id);
  }, [loopDeps.length]);

  const onFight = (dep: DeploymentRow) => {
    setFightError(null);
    actions.fight.mutate(dep.id, {
      onSuccess: (data) => setFightView(data),
      onError: (e) => setFightError(e instanceof Error ? e.message : 'Erreur'),
    });
  };

  // Groupes déployés dans la zone actuellement sélectionnée.
  const selectedDeps = selectedMap
    ? deps.filter((d) => selectedMap.levels.some((l) => l.id === d.level_id))
    : [];

  return (
    <section className="anim-fade flex h-full min-h-0 flex-col gap-4">
      <div className="shrink-0">
        <h2 className="heading text-2xl">Carte du monde</h2>
        <p className="text-sm text-[var(--color-muted)]">
          Choisis une zone, déploie tes escouades. Avancer : combats visibles. Boucle : farm
          automatique, gains récoltés tout seuls.
        </p>
      </div>

      {fightError && <p className="shrink-0 text-sm text-[var(--color-ember)]">{fightError}</p>}

      {mapsLoading && <p className="text-[var(--color-muted)]">Chargement de la carte…</p>}

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        {/* Colonne gauche : liste des zones */}
        <div className="lg:w-72 lg:shrink-0">
          <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {mapList.map((map) => (
              <ZoneListItem
                key={map.id}
                map={map}
                active={selectedMap?.id === map.id}
                clearedSet={clearedSet}
                deployed={map.levels.some((l) => depByLevel.has(l.id))}
                onClick={() => setSelectedId(map.id)}
              />
            ))}
          </div>
        </div>

        {/* Colonne droite : détail immersif de la zone */}
        {selectedMap && (
          <div className="min-w-0 flex-1 space-y-4">
            <ZoneDetail
              map={selectedMap}
              clearedSet={clearedSet}
              depByLevel={depByLevel}
              onPick={(level) =>
                levelState(level, selectedMap, clearedSet) !== 'locked' &&
                setDeployTarget({ level, map: selectedMap })
              }
            />

            {/* Groupes déployés dans cette zone */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-[var(--color-muted)]">
                Groupes déployés · {selectedMap.name}
              </h3>
              {selectedDeps.length === 0 ? (
                <p className="panel p-4 text-sm text-[var(--color-muted)]">
                  Aucune escouade ici. Clique sur un niveau pour déployer un groupe.
                </p>
              ) : (
                selectedDeps.map((dep) => (
                  <DeploymentCard
                    key={dep.id}
                    dep={dep}
                    now={now}
                    maps={mapList}
                    heroById={heroById}
                    onToggleMode={() =>
                      actions.setMode.mutate({
                        deploymentId: dep.id,
                        mode: dep.mode === 'advance' ? 'loop' : 'advance',
                      })
                    }
                    onFight={() => onFight(dep)}
                    fighting={actions.fight.isPending}
                    onReplay={() => {
                      if (dep.last_combat) setReplay(dep.last_combat as StoredCombat);
                    }}
                    onRemove={() => actions.undeploy.mutate(dep.id)}
                    busy={actions.setMode.isPending || actions.undeploy.isPending}
                  />
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {deployTarget && (
        <DeployModal
          level={deployTarget.level}
          heroes={heroList}
          availability={availability}
          onClose={() => setDeployTarget(null)}
          onDeploy={(heroIds, mode) => {
            actions.deploy.mutate(
              { levelId: deployTarget.level.id, heroIds, mode },
              { onSuccess: () => setDeployTarget(null) },
            );
          }}
          pending={actions.deploy.isPending}
          error={actions.deploy.error instanceof Error ? actions.deploy.error.message : null}
        />
      )}

      {replay && <CombatReplay combat={replay} onClose={() => setReplay(null)} />}
      {fightView && (
        <CombatReplay
          combat={fightView.combat}
          live
          title={`Assaut — ${fightView.rewards.level_name || 'combat'}`}
          footer={
            <>
              <FightRewardsFooter rewards={fightView.rewards} />
              <button
                onClick={() => setFightView(null)}
                className="btn btn-primary mt-3 text-sm"
              >
                Continuer
              </button>
            </>
          }
          onClose={() => setFightView(null)}
        />
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function ZoneListItem({
  map,
  active,
  clearedSet,
  deployed,
  onClick,
}: {
  map: MapRow;
  active: boolean;
  clearedSet: Set<string>;
  deployed: boolean;
  onClick: () => void;
}) {
  const clearedCount = map.levels.filter((l) => clearedSet.has(l.id)).length;
  const total = map.levels.length;
  const zoneDone = clearedCount === total;

  return (
    <button
      onClick={onClick}
      className={`relative flex w-52 shrink-0 flex-col gap-2 rounded-xl border p-3 text-left transition lg:w-full ${
        active
          ? 'border-[var(--color-edge-strong)] bg-[var(--color-panel-2)]'
          : 'border-[var(--color-edge)] bg-[var(--color-panel)] hover:bg-[var(--color-panel-2)]'
      }`}
    >
      {/* Barre d'accent à gauche quand active */}
      <span
        className={`absolute left-0 top-3 bottom-3 w-1 rounded-r-full transition ${
          active ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ background: map.accent }}
      />
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: map.accent }} />
        <span className="min-w-0 flex-1 truncate font-display font-semibold text-[var(--color-ink)]">
          {map.name}
        </span>
        {zoneDone && <UiIcon name="boss" size={16} title="Zone terminée" />}
        {deployed && !zoneDone && (
          <UiIcon name="attack" size={13} color="var(--color-arcane)" title="Escouade déployée" />
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/40">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${(clearedCount / Math.max(1, total)) * 100}%`, background: map.accent }}
          />
        </div>
        <span className="text-[10px] tabular-nums text-[var(--color-muted)]">
          {clearedCount}/{total}
        </span>
      </div>
    </button>
  );
}

function ZoneDetail({
  map,
  clearedSet,
  depByLevel,
  onPick,
}: {
  map: MapRow;
  clearedSet: Set<string>;
  depByLevel: Map<string, 'advance' | 'loop'>;
  onPick: (level: LevelRow) => void;
}) {
  const clearedCount = map.levels.filter((l) => clearedSet.has(l.id)).length;
  const total = map.levels.length;
  const zoneDone = clearedCount === total;
  const diffs = map.levels.map((l) => l.difficulty);
  const diffMin = Math.min(...diffs);
  const diffMax = Math.max(...diffs);

  return (
    <div className="panel overflow-hidden">
      {/* Bandeau immersif : aplat teinté par la zone + art Synty en filigrane */}
      <div className="relative p-5" style={{ backgroundColor: `${map.accent}14` }}>
        <SyntyImg
          src={MAP_ART.dragon}
          size={180}
          className="pointer-events-none absolute -right-6 -top-6 opacity-[0.07]"
        />
        <div className="relative flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-full"
                style={{ background: map.accent }}
              />
              <h3 className="font-display text-xl font-extrabold text-[var(--color-ink)]">
                {map.name}
              </h3>
              {zoneDone && <UiIcon name="boss" size={16} title="Zone terminée" />}
            </div>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              {total} niveaux · Difficulté {diffMin}–{diffMax}
            </p>
          </div>
          <div className="min-w-[140px]">
            <div className="mb-1 flex items-center justify-between text-[10px] text-[var(--color-muted)]">
              <span>Progression</span>
              <span className="tabular-nums">
                {clearedCount}/{total}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-black/40">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${(clearedCount / Math.max(1, total)) * 100}%`,
                  background: map.accent,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="divider" />

      {/* Sentier de niveaux */}
      <div className="flex flex-wrap items-center gap-y-4 p-5">
        {map.levels.map((level, i) => {
          const state = levelState(level, map, clearedSet);
          const prev = i > 0 ? map.levels[i - 1]! : null;
          return (
            <Fragment key={level.id}>
              {prev && (
                <div
                  className="mx-1.5 h-0.5 w-6 shrink-0 rounded-full"
                  style={{
                    background: clearedSet.has(prev.id) ? map.accent : 'rgba(255,255,255,0.1)',
                  }}
                />
              )}
              <LevelNode
                level={level}
                state={state}
                accent={map.accent}
                deployedMode={depByLevel.get(level.id) ?? null}
                onClick={() => onPick(level)}
              />
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

function FightRewardsFooter({ rewards }: { rewards: FightRewards }) {
  return (
    <div className="mt-2 flex flex-wrap justify-center gap-2 text-xs">
      {rewards.xp_per_hero > 0 && (
        <span className="chip inline-flex items-center gap-1 bg-[var(--color-arcane)]/20 text-[var(--color-ink)]">
          <UiIcon name="xp" size={12} /> +{rewards.xp_per_hero} XP / héros
        </span>
      )}
      {rewards.gold > 0 && (
        <span className="chip inline-flex items-center gap-1 bg-[var(--color-gold)]/15 text-[var(--color-gold-soft)]">
          <UiIcon name="gold" size={12} /> +{rewards.gold} or
        </span>
      )}
      {rewards.level_ups.length > 0 && (
        <span className="chip inline-flex items-center gap-1 bg-emerald-500/15 text-emerald-300">
          <UiIcon name="levelUp" size={12} /> {rewards.level_ups.reduce((s, l) => s + l.levels, 0)}{' '}
          niveau(x)
        </span>
      )}
      {Object.entries(rewards.resources).map(([res, amt]) => (
        <span key={res} className="chip inline-flex items-center gap-1 bg-white/5 text-[var(--color-ink)]">
          <ResourceIcon resKey={res} /> +{amt} {resourceMeta(res).label}
        </span>
      ))}
      {rewards.advanced > 0 && (
        <span className="chip bg-[var(--color-arcane)]/20 text-[var(--color-ink)]">
          → Niveau suivant : {rewards.level_name}
        </span>
      )}
    </div>
  );
}

function LevelNode({
  level,
  state,
  accent,
  deployedMode,
  onClick,
}: {
  level: LevelRow;
  state: LevelState;
  accent: string;
  deployedMode: 'advance' | 'loop' | null;
  onClick: () => void;
}) {
  const locked = state === 'locked';
  const cleared = state === 'cleared';
  const available = state === 'available';
  const deployed = deployedMode !== null;
  const size = level.isBoss ? 'h-16 w-16' : 'h-12 w-12';

  return (
    <button
      onClick={onClick}
      disabled={locked}
      title={`${level.name} · Difficulté ${level.difficulty}${level.isBoss ? ' · Boss' : ''}${
        deployed ? ' · groupe déployé' : ''
      }`}
      className={`relative flex ${size} shrink-0 flex-col items-center justify-center rounded-xl border-2 transition ${
        locked ? 'cursor-not-allowed opacity-40' : 'hover:scale-105'
      } ${deployed ? 'ring-2 ring-[var(--color-arcane)] ring-offset-2 ring-offset-[var(--color-panel)]' : ''}`}
      style={{
        borderColor: cleared || available ? accent : 'var(--color-edge)',
        backgroundColor: cleared ? `${accent}26` : available ? `${accent}12` : 'rgba(0,0,0,0.25)',
      }}
    >
      <span className="font-display text-sm font-bold leading-none text-[var(--color-ink)]">
        {level.level_index}
      </span>
      <span className="text-[8px] leading-tight text-[var(--color-muted)]">D{level.difficulty}</span>
      {level.isBoss && (
        <SyntyImg src={MAP_ART.skull} size={16} className="absolute -top-3" title="Boss" />
      )}
      {deployed && (
        <span className="absolute -left-1.5 -top-1.5">
          <UiIcon
            name={deployedMode === 'advance' ? 'attack' : 'loop'}
            size={13}
            color="var(--color-arcane)"
          />
        </span>
      )}
      {cleared && !deployed && (
        <span
          className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] text-black"
          style={{ background: accent }}
        >
          ✓
        </span>
      )}
      {locked && (
        <span className="absolute -bottom-1 -right-1">
          <UiIcon name="lock" size={11} color="var(--color-muted)" />
        </span>
      )}
    </button>
  );
}

function DeploymentCard({
  dep,
  now,
  maps,
  heroById,
  onToggleMode,
  onFight,
  fighting,
  onReplay,
  onRemove,
  busy,
}: {
  dep: DeploymentRow;
  now: number;
  maps: MapRow[];
  heroById: (id: string) => HeroView | undefined;
  onToggleMode: () => void;
  onFight: () => void;
  fighting: boolean;
  onReplay: () => void;
  onRemove: () => void;
  busy: boolean;
}) {
  const level = maps.flatMap((m) => m.levels).find((l) => l.id === dep.level_id);
  const map = maps.find((m) => m.id === level?.map_id);

  const elapsed = (now - Date.parse(dep.last_resolved_at)) / 1000;
  const pending = fightsForElapsed(elapsed);
  const cooldownLeft = Math.max(0, Math.ceil(FIGHT_COOLDOWN_SECONDS - elapsed));
  const manual = dep.mode === 'advance';

  return (
    <div
      className={`panel overflow-hidden ${dep.blocked ? 'ring-1 ring-[var(--color-ember)]/60' : ''}`}
    >
      <div className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              {dep.hero_ids.map((id) => {
                const h = heroById(id);
                return (
                  <span
                    key={id}
                    title={h?.name}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-edge)] bg-[var(--color-panel-2)]"
                  >
                    {h ? (
                      <ClassIcon classId={h.classId} size={18} />
                    ) : (
                      <SyntyGlyph src={syntyUrl.map('Unknown01')} color="var(--color-muted)" size={16} />
                    )}
                  </span>
                );
              })}
            </div>
            <div>
              <div className="font-medium text-[var(--color-ink)]">
                {map?.name} · Niv. {level?.level_index ?? '?'}
              </div>
              <div className="text-xs text-[var(--color-muted)]">{level?.name}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {manual && (
              <button
                onClick={onFight}
                disabled={fighting || cooldownLeft > 0}
                className="btn btn-primary px-3 py-1.5 text-xs"
                title="Lancer un assaut sur ce niveau"
              >
                <UiIcon name="attack" size={13} color="currentColor" />
                {fighting ? 'Combat…' : cooldownLeft > 0 ? `${cooldownLeft}s` : 'Attaquer'}
              </button>
            )}
            <button
              onClick={onToggleMode}
              disabled={busy}
              className={`chip ${
                manual
                  ? 'bg-[var(--color-arcane)]/20 text-[var(--color-ink)]'
                  : 'bg-[var(--color-gold)]/15 text-[var(--color-gold-soft)]'
              }`}
              title="Basculer avancer / farmer en boucle"
            >
              <UiIcon name={manual ? 'attack' : 'loop'} size={12} color="currentColor" />
              {manual ? 'Avancer' : 'Boucle'}
            </button>
            {dep.last_combat != null && (
              <button onClick={onReplay} className="btn btn-ghost px-3 py-1.5 text-xs">
                ▶ Replay
              </button>
            )}
            <button
              onClick={onRemove}
              disabled={busy}
              className="btn btn-ghost px-3 py-1.5 text-xs"
              title="Retirer le groupe"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {manual ? (
            <span className="chip inline-flex items-center gap-1 bg-white/5 text-[var(--color-muted)]">
              <UiIcon name="attack" size={11} color="currentColor" /> Assauts manuels — chaque combat
              se regarde
            </span>
          ) : (
            <span className="chip inline-flex items-center gap-1 bg-white/5 text-[var(--color-muted)]">
              <UiIcon name="loop" size={11} color="currentColor" /> ≈ {pending} combat(s) · récolte
              auto
            </span>
          )}
          {dep.last_fights > 0 && (
            <span className="chip bg-white/5 text-[var(--color-muted)]">
              Dernière session : <span className="text-emerald-300">{dep.last_wins}V</span> ·{' '}
              <span className="text-[var(--color-ember)]">{dep.last_losses}D</span>
            </span>
          )}
          {dep.mode === 'loop' && dep.clears_count > 0 && (
            <span className="chip inline-flex items-center gap-1 bg-[var(--color-gold)]/15 text-[var(--color-gold-soft)]">
              <UiIcon name="loop" size={11} color="currentColor" /> {dep.clears_count} fois complété
            </span>
          )}
          {dep.blocked && (
            <span className="chip inline-flex items-center gap-1 bg-[var(--color-ember)]/20 text-[var(--color-ember)]">
              <UiIcon name="warning" size={11} color="currentColor" /> Bloquée — renforce l'équipe
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function DeployModal({
  level,
  heroes,
  availability,
  onClose,
  onDeploy,
  pending,
  error,
}: {
  level: LevelRow;
  heroes: HeroView[];
  availability: Map<string, HeroStatus>;
  onClose: () => void;
  onDeploy: (heroIds: string[], mode: 'advance' | 'loop') => void;
  pending: boolean;
  error: string | null;
}) {
  // Composition par slots : drag & drop des blocs héros (clic = fallback).
  const [slots, setSlots] = useState<(string | null)[]>([null, null, null, null, null]);
  const [mode, setMode] = useState<'advance' | 'loop'>('advance');

  const team = slots.filter((s): s is string => s !== null);
  const isBusy = (id: string) => heroIsBusy(availability.get(id));
  // Pool = tous les héros non placés ; les occupés (farm/expédition) sont affichés
  // mais non sélectionnables, pour qu'on voie la dispo AVANT de composer.
  const notInSlots = heroes.filter((h) => !slots.includes(h.id));
  const pool = notInSlots.filter((h) => !isBusy(h.id));
  const busyPool = notInSlots.filter((h) => isBusy(h.id));
  const gem = gemByMap(level.map_id);

  function placeHero(id: string, slotIndex: number) {
    if (isBusy(id)) return;
    setSlots((prev) => {
      const next = prev.map((s) => (s === id ? null : s));
      next[slotIndex] = id;
      return next;
    });
  }

  function removeHero(id: string) {
    setSlots((prev) => prev.map((s) => (s === id ? null : s)));
  }

  function addToFirstFree(id: string) {
    if (isBusy(id)) return;
    setSlots((prev) => {
      if (prev.includes(id)) return prev;
      const free = prev.indexOf(null);
      if (free === -1) return prev;
      const next = [...prev];
      next[free] = id;
      return next;
    });
  }

  function onDropInSlot(e: DragEvent, slotIndex: number) {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/hero');
    if (id) placeHero(id, slotIndex);
  }

  function onDropInPool(e: DragEvent) {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/hero');
    if (id) removeHero(id);
  }

  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

  return (
    <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="panel anim-pop max-h-[90vh] w-full max-w-md overflow-y-auto p-5">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="font-display flex items-center gap-2 text-lg font-semibold text-[var(--color-ink)]">
            <SyntyImg
              src={level.isBoss ? MAP_ART.dragon : MAP_ART.monster}
              size={26}
              title={level.isBoss ? 'Boss' : 'Monstres'}
            />
            {level.name}
          </h3>
          <button
            onClick={onClose}
            className="text-[var(--color-muted)] hover:text-[var(--color-ink)]"
          >
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-[var(--color-muted)]">
          Difficulté {level.difficulty} · {level.enemyCount} ennemi(s)
          {level.isBoss ? ' · Boss' : ''}
        </p>

        {/* Composition : glisse tes héros dans les emplacements (clic = ajout/retrait) */}
        <div className="mb-4">
          <div className="mb-2 text-sm font-medium text-[var(--color-muted)]">
            Composition · {team.length}/5
          </div>
          <div className="mb-3 grid grid-cols-5 gap-2">
            {slots.map((slotId, i) => {
              const h = slotId ? heroes.find((x) => x.id === slotId) : undefined;
              return (
                <div
                  key={i}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => onDropInSlot(e, i)}
                  className={`flex aspect-square flex-col items-center justify-center rounded-xl border text-center transition ${
                    h
                      ? 'border-[var(--color-arcane)] bg-[var(--color-arcane)]/15'
                      : 'border-dashed border-[var(--color-edge)] bg-black/20'
                  }`}
                >
                  {h ? (
                    <button
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('text/hero', h.id)}
                      onClick={() => removeHero(h.id)}
                      title={`${h.name} — clic pour retirer`}
                      className="flex h-full w-full cursor-grab flex-col items-center justify-center active:cursor-grabbing"
                    >
                      <span className="text-lg"><ClassIcon classId={h.classId} size={18} /></span>
                      <span className="w-full truncate px-1 text-[10px] text-[var(--color-ink)]">
                        {h.name}
                      </span>
                      <span className="text-[9px] text-[var(--color-muted)]">N.{h.level}</span>
                    </button>
                  ) : (
                    <span className="text-lg text-[var(--color-muted)]/40">+</span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mb-1 text-xs text-[var(--color-muted)]">
            Héros — clique/glisse les disponibles. Les occupés (farm / expédition) sont grisés.
          </div>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDropInPool}
            className="flex min-h-[52px] flex-wrap gap-2 rounded-lg border border-[var(--color-edge)] bg-black/10 p-2"
          >
            {pool.length === 0 && busyPool.length === 0 && (
              <p className="text-xs text-[var(--color-muted)]/60">
                Tous tes héros disponibles sont dans la composition.
              </p>
            )}
            {pool.map((h) => (
              <button
                key={h.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/hero', h.id)}
                onClick={() => addToFirstFree(h.id)}
                title={`${h.name} — glisse ou clique pour ajouter`}
                className="flex cursor-grab items-center gap-1.5 rounded-lg border border-[var(--color-edge)] bg-black/20 px-3 py-2 text-sm text-[var(--color-muted)] transition hover:border-white/25 active:cursor-grabbing"
              >
                <ClassIcon classId={h.classId} size={18} />
                {h.name}
                <span className="text-[10px] text-[var(--color-muted)]">N.{h.level}</span>
              </button>
            ))}
            {busyPool.map((h) => (
              <span
                key={h.id}
                title={`${h.name} — ${HERO_STATUS_LABEL[availability.get(h.id) ?? 'free']}`}
                className="flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-dashed border-[var(--color-edge)] bg-black/10 px-3 py-2 text-sm text-[var(--color-muted)]/45"
              >
                <ClassIcon classId={h.classId} size={18} />
                {h.name}
                <span className="rounded bg-white/5 px-1 text-[9px] uppercase tracking-wide">
                  {HERO_STATUS_LABEL[availability.get(h.id) ?? 'free']}
                </span>
              </span>
            ))}
          </div>
        </div>

        <div className="mb-4 flex gap-2">
          <ModeButton
            active={mode === 'advance'}
            onClick={() => setMode('advance')}
            label="Avancer (combats visibles)"
          />
          <ModeButton
            active={mode === 'loop'}
            onClick={() => setMode('loop')}
            label="Farmer en boucle (auto)"
          />
        </div>
        <p className="mb-4 text-[10px] text-[var(--color-muted)]/80">
          {mode === 'advance'
            ? 'Tu lances chaque assaut et tu regardes le combat se dérouler. Victoire = niveau suivant.'
            : "L'équipe farme ce niveau automatiquement, même hors ligne. Les gains sont récoltés tout seuls."}
        </p>

        {/* Butin : matériaux (+ gemme sur les boss) — l'équipement vient de la forge */}
        <div className="mb-4 rounded-lg border border-[var(--color-edge)] bg-black/20 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1 text-[var(--color-ink)]">
              <ResourceIcon resKey={level.resource} /> Matériau {resourceMeta(level.resource).label}
            </span>
            <span className="text-[var(--color-muted)]">
              {pct(materialDropChance(level.difficulty))} / combat gagné
            </span>
          </div>
          {level.isBoss && gem && (
            <div className="mt-2 flex items-center justify-between border-t border-[var(--color-edge)] pt-2 text-xs">
              <span className="inline-flex items-center gap-1 text-[var(--color-ink)]">
                <ResourceIcon resKey={gem.id} size={16} /> {gem.label}{' '}
                <span className="inline-flex items-center gap-1 text-[var(--color-arcane)]">
                  (<PassiveIcon passive={gem.passive} size={12} /> {gem.passiveLabel})
                </span>
              </span>
              <span className="text-[var(--color-muted)]">
                {pct(GEM_DROP_CHANCE)} / boss vaincu
              </span>
            </div>
          )}
          <p className="mt-2 text-[10px] text-[var(--color-muted)]/70">
            L'équipement ne droppe pas en zone : forge-le avec les matériaux. Les boss lâchent
            leur composant rare{level.isBoss && gem ? ' et leur gemme de joaillerie' : ''}.
          </p>
        </div>

        {error && <p className="mb-2 text-sm text-[var(--color-ember)]">{error}</p>}

        <button
          onClick={() => team.length > 0 && onDeploy(team, mode)}
          disabled={team.length === 0 || pending}
          className="btn btn-primary w-full"
        >
          {pending ? 'Déploiement…' : 'Déployer'}
        </button>
      </div>
    </div>
  );
}

function ModeButton({
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
      className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition ${
        active
          ? 'border-[var(--color-arcane)] bg-[var(--color-arcane)]/15 text-white'
          : 'border-[var(--color-edge)] text-[var(--color-muted)] hover:border-white/25'
      }`}
    >
      {label}
    </button>
  );
}
