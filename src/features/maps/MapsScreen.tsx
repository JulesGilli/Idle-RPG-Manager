import { Fragment, useEffect, useRef, useState, type DragEvent } from 'react';
import { useHeroes, type HeroView } from '@/features/heroes/useHeroes';
import { classMeta } from '@/lib/gameUi';
import { CombatReplay, type StoredCombat } from '@/components/CombatReplay';
import { resourceMeta } from '@/hooks/useResources';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { SyntyImg } from '@/components/synty/SyntyIcon';
import { MAP_ART } from '@/lib/synty';
import { fightsForElapsed, FIGHT_COOLDOWN_SECONDS } from '@shared/progression/deployment';
import { materialDropChance } from '@shared/progression/loot';
import { gemByMap, GEM_DROP_CHANCE, PASSIVE_META } from '@shared/progression/jewelry';
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

  const clearedSet = cleared ?? new Set<string>();
  const heroList = heroes ?? [];
  const deps = deployments ?? [];
  const loopDeps = deps.filter((d) => d.mode === 'loop');

  // Horloge live (1 s) pour les combats en attente et le cooldown d'assaut.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deps.length === 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [deps.length]);

  const deployedHeroIds = new Set(deps.flatMap((d) => d.hero_ids));
  const availableHeroes = heroList.filter((h) => !deployedHeroIds.has(h.id));
  const depByLevel = new Map(deps.map((d) => [d.level_id, d.mode]));

  function heroById(id: string): HeroView | undefined {
    return heroList.find((h) => h.id === id);
  }

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

  return (
    <section className="anim-fade space-y-6">
      <div>
        <h2 className="heading text-2xl">🗺️ Carte du monde</h2>
        <p className="text-sm text-[var(--color-muted)]">
          ⚔️ Avancer : lance des assauts et regarde tes combats. 🔁 Boucle : farm automatique,
          gains récoltés tout seuls.
        </p>
      </div>

      {fightError && <p className="text-sm text-[var(--color-ember)]">{fightError}</p>}

      {/* Groupes déployés */}
      {deps.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-[var(--color-muted)]">Groupes déployés</h3>
          {deps.map((dep) => (
            <DeploymentCard
              key={dep.id}
              dep={dep}
              now={now}
              maps={maps ?? []}
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
          ))}
        </div>
      )}

      {/* Zones : sentier de niveaux */}
      {mapsLoading && <p className="text-[var(--color-muted)]">Chargement de la carte…</p>}
      <div className="space-y-4">
        {(maps ?? []).map((map) => {
          const clearedCount = map.levels.filter((l) => clearedSet.has(l.id)).length;
          const zoneDone = map.levels.every((l) => clearedSet.has(l.id));
          return (
            <div key={map.id} className="panel overflow-hidden p-0">
              <div
                className="p-4"
                style={{
                  background: `linear-gradient(120deg, ${map.accent}1c 0%, transparent 55%)`,
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: map.accent, boxShadow: `0 0 12px ${map.accent}` }}
                    />
                    <h3 className="font-display font-semibold text-[var(--color-ink)]">
                      {map.name}
                    </h3>
                    {zoneDone && (
                      <span className="text-sm" title="Zone terminée">
                        👑
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] tabular-nums text-[var(--color-muted)]">
                      {clearedCount}/{map.levels.length}
                    </span>
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-black/40">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${(clearedCount / Math.max(1, map.levels.length)) * 100}%`,
                          background: map.accent,
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex items-center px-1">
                  {map.levels.map((level, i) => {
                    const state = levelState(level, map, clearedSet);
                    const prev = i > 0 ? map.levels[i - 1]! : null;
                    return (
                      <Fragment key={level.id}>
                        {prev && (
                          <div
                            className="mx-1 h-0.5 min-w-3 flex-1 rounded-full"
                            style={{
                              background: clearedSet.has(prev.id)
                                ? `linear-gradient(90deg, ${map.accent}, ${map.accent}55)`
                                : 'rgba(255,255,255,0.08)',
                            }}
                          />
                        )}
                        <LevelNode
                          level={level}
                          state={state}
                          accent={map.accent}
                          deployedMode={depByLevel.get(level.id) ?? null}
                          onClick={() => state !== 'locked' && setDeployTarget({ level, map })}
                        />
                      </Fragment>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {deployTarget && (
        <DeployModal
          level={deployTarget.level}
          heroes={availableHeroes}
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
          title={`⚔️ Assaut — ${fightView.rewards.level_name || 'combat'}`}
          footer={<FightRewardsFooter rewards={fightView.rewards} />}
          onClose={() => setFightView(null)}
        />
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function FightRewardsFooter({ rewards }: { rewards: FightRewards }) {
  return (
    <div className="mt-2 flex flex-wrap justify-center gap-2 text-xs">
      {rewards.xp_per_hero > 0 && (
        <span className="chip bg-[var(--color-arcane)]/20 text-[var(--color-ink)]">
          ✨ +{rewards.xp_per_hero} XP / héros
        </span>
      )}
      {rewards.gold > 0 && (
        <span className="chip bg-[var(--color-gold)]/15 text-[var(--color-gold-soft)]">
          💰 +{rewards.gold} or
        </span>
      )}
      {rewards.level_ups.length > 0 && (
        <span className="chip bg-emerald-500/15 text-emerald-300">
          ⬆ {rewards.level_ups.reduce((s, l) => s + l.levels, 0)} niveau(x)
        </span>
      )}
      {Object.entries(rewards.resources).map(([res, amt]) => (
        <span key={res} className="chip inline-flex items-center gap-1 bg-white/5 text-[var(--color-ink)]">
          <ResourceIcon resKey={res} /> +{amt} {resourceMeta(res).label}
        </span>
      ))}
      {rewards.advanced > 0 && (
        <span className="chip bg-[var(--color-arcane)]/20 text-[var(--color-ink)]">
          ➡ Niveau suivant : {rewards.level_name}
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
  const size = level.isBoss ? 'h-14 w-14' : 'h-11 w-11';

  return (
    <button
      onClick={onClick}
      disabled={locked}
      title={`${level.name} · Difficulté ${level.difficulty}${level.isBoss ? ' · Boss 👑' : ''}${
        deployed ? ' · groupe déployé' : ''
      }`}
      className={`relative flex ${size} shrink-0 flex-col items-center justify-center rounded-full border-2 transition ${
        locked ? 'cursor-not-allowed opacity-35' : 'hover:scale-110'
      } ${deployed ? 'ring-2 ring-[var(--color-arcane)]' : ''}`}
      style={{
        borderColor: cleared ? accent : available ? `${accent}99` : 'var(--color-edge)',
        background: cleared
          ? `radial-gradient(circle at 30% 30%, ${accent}40, ${accent}14)`
          : 'rgba(0,0,0,0.35)',
        boxShadow: available && !deployed ? `0 0 14px ${accent}66` : undefined,
      }}
    >
      <span className="font-display text-sm font-bold leading-none text-[var(--color-ink)]">
        {level.level_index}
      </span>
      <span className="text-[8px] leading-tight text-[var(--color-muted)]">
        D{level.difficulty}
      </span>
      {level.isBoss && (
        <SyntyImg src={MAP_ART.skull} size={16} className="absolute -top-3 drop-shadow" title="Boss" />
      )}
      {deployed && (
        <span className="absolute -left-1.5 -top-1.5 text-[11px]">
          {deployedMode === 'advance' ? '⚔️' : '🔁'}
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
      {locked && <span className="absolute -bottom-1 -right-1 text-[10px]">🔒</span>}
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
      className={`panel anim-slide overflow-hidden p-0 ${
        dep.blocked ? 'ring-1 ring-[var(--color-ember)]/60' : ''
      }`}
    >
      <div
        className="p-4"
        style={
          map
            ? { background: `linear-gradient(120deg, ${map.accent}14 0%, transparent 50%)` }
            : undefined
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              {dep.hero_ids.map((id) => {
                const h = heroById(id);
                return (
                  <span
                    key={id}
                    title={h?.name}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-edge)] bg-[var(--color-panel)] text-sm"
                  >
                    {h ? classMeta(h.classId).icon : '❔'}
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
                {fighting ? '⚔️ Combat…' : cooldownLeft > 0 ? `⚔️ ${cooldownLeft}s` : '⚔️ Attaquer'}
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
              {manual ? '⚔️ Avancer' : '🔁 Boucle'}
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
            <span className="chip bg-white/5 text-[var(--color-muted)]">
              ⚔️ Assauts manuels — chaque combat se regarde
            </span>
          ) : (
            <span className="chip bg-white/5 text-[var(--color-muted)]">
              ⏳ ≈ {pending} combat(s) · récolte auto
            </span>
          )}
          {dep.last_fights > 0 && (
            <span className="chip bg-white/5 text-[var(--color-muted)]">
              Dernière session : <span className="text-emerald-300">{dep.last_wins}V</span> ·{' '}
              <span className="text-[var(--color-ember)]">{dep.last_losses}D</span>
            </span>
          )}
          {dep.mode === 'loop' && dep.clears_count > 0 && (
            <span className="chip bg-[var(--color-gold)]/15 text-[var(--color-gold-soft)]">
              🔁 {dep.clears_count} fois complété
            </span>
          )}
          {dep.blocked && (
            <span className="chip bg-[var(--color-ember)]/20 text-[var(--color-ember)]">
              ⚠ Bloquée — renforce l'équipe
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
  onClose,
  onDeploy,
  pending,
  error,
}: {
  level: LevelRow;
  heroes: HeroView[];
  onClose: () => void;
  onDeploy: (heroIds: string[], mode: 'advance' | 'loop') => void;
  pending: boolean;
  error: string | null;
}) {
  // Composition par slots : drag & drop des blocs héros (clic = fallback).
  const [slots, setSlots] = useState<(string | null)[]>([null, null, null, null, null]);
  const [mode, setMode] = useState<'advance' | 'loop'>('advance');

  const team = slots.filter((s): s is string => s !== null);
  const pool = heroes.filter((h) => !slots.includes(h.id));
  const gem = gemByMap(level.map_id);

  function placeHero(id: string, slotIndex: number) {
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
    <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="panel anim-pop max-h-[90vh] w-full max-w-md overflow-y-auto p-5">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="font-display flex items-center gap-2 text-lg font-semibold text-[var(--color-ink)]">
            <SyntyImg
              src={level.isBoss ? MAP_ART.dragon : MAP_ART.monster}
              size={26}
              className="drop-shadow"
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
          {level.isBoss ? ' · Boss 👑' : ''}
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
                      <span className="text-lg">{classMeta(h.classId).icon}</span>
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
            Héros disponibles — glisse-les dans la composition :
          </div>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDropInPool}
            className="flex min-h-[52px] flex-wrap gap-2 rounded-lg border border-[var(--color-edge)] bg-black/10 p-2"
          >
            {heroes.length === 0 ? (
              <p className="text-xs text-[var(--color-muted)]">
                Tous tes héros sont déjà déployés. Retire un groupe pour en libérer.
              </p>
            ) : pool.length === 0 ? (
              <p className="text-xs text-[var(--color-muted)]/60">
                Tous tes héros disponibles sont dans la composition.
              </p>
            ) : (
              pool.map((h) => (
                <button
                  key={h.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/hero', h.id)}
                  onClick={() => addToFirstFree(h.id)}
                  title={`${h.name} — glisse ou clique pour ajouter`}
                  className="flex cursor-grab items-center gap-1.5 rounded-lg border border-[var(--color-edge)] bg-black/20 px-3 py-2 text-sm text-[var(--color-muted)] transition hover:border-white/25 active:cursor-grabbing"
                >
                  <span>{classMeta(h.classId).icon}</span>
                  {h.name}
                  <span className="text-[10px] text-[var(--color-muted)]">N.{h.level}</span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="mb-4 flex gap-2">
          <ModeButton
            active={mode === 'advance'}
            onClick={() => setMode('advance')}
            label="⚔️ Avancer (combats visibles)"
          />
          <ModeButton
            active={mode === 'loop'}
            onClick={() => setMode('loop')}
            label="🔁 Farmer en boucle (auto)"
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
                <span className="text-[var(--color-arcane)]">
                  ({PASSIVE_META[gem.passive].icon} {gem.passiveLabel})
                </span>
              </span>
              <span className="text-[var(--color-muted)]">
                {pct(GEM_DROP_CHANCE)} / boss vaincu
              </span>
            </div>
          )}
          <p className="mt-2 text-[10px] text-[var(--color-muted)]/70">
            L'équipement ne droppe pas en zone : forge-le avec les matériaux. Les boss 👑 lâchent
            leur composant rare{level.isBoss && gem ? ' et leur gemme de joaillerie' : ''}.
          </p>
        </div>

        {error && <p className="mb-2 text-sm text-[var(--color-ember)]">{error}</p>}

        <button
          onClick={() => team.length > 0 && onDeploy(team, mode)}
          disabled={team.length === 0 || pending}
          className="btn btn-primary w-full"
        >
          {pending ? 'Déploiement…' : '🗺️ Déployer'}
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
