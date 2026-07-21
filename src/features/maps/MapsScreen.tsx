import { Fragment, useEffect, useRef, useState, type DragEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useHeroes, type HeroView } from '@/features/heroes/useHeroes';
import {
  useHeroAvailability,
  heroIsBusy,
  HERO_STATUS_LABEL,
  type HeroStatus,
} from '@/features/heroes/useHeroAvailability';
import { CombatReplay, type StoredCombat } from '@/components/CombatReplay';
import { BodyPortal } from '@/components/BodyPortal';
import { resourceMeta } from '@/hooks/useResources';
import { compactNumber } from '@/lib/gameUi';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { SyntyImg, SyntyGlyph } from '@/components/synty/SyntyIcon';
import { UiIcon, ClassIcon, PassiveIcon } from '@/components/synty/GameIcons';
import { FighterSprite, EnemySprite, fighterKind } from '@/components/combat/FighterSprite';
import { MAP_ART, syntyUrl } from '@/lib/synty';
import { fightsForElapsed, FIGHT_COOLDOWN_SECONDS } from '@shared/progression/deployment';
import { materialDropChance, BOSS_MATERIAL_CHANCE } from '@shared/progression/loot';
import { gemByMap, GEM_DROP_CHANCE } from '@shared/progression/jewelry';
import { BORROW_LIMIT_PER_TEAM, BORROW_MAP_FIGHTS_PER_DAY } from '@shared/progression/garrison';
import { useTourSignals } from '@/features/tour/tourSignals';
import { useBorrowableHeroes, type GarrisonHero } from '@/features/guild/useGuild';
import { useBorrowUsage, mapFightsLeft } from '@/features/guild/useBorrowUsage';
import {
  useMaps,
  useLevelProgress,
  useDeployments,
  type LevelRow,
  type MapRow,
  type DeploymentRow,
} from './useMaps';
import {
  useDeploymentActions,
  DeploymentError,
  type FightResponse,
  type FightRewards,
  type ClaimResponse,
} from './useDeploymentActions';
import {
  useTeamPresets,
  useTeamPresetActions,
  MAX_TEAM_PRESETS,
  type TeamPreset,
} from './useTeamPresets';
import { useOnboardingStore } from '@/store/onboardingStore';
import { BackToActivities } from '@/components/BackToActivities';

type LevelState = 'cleared' | 'available' | 'locked';

function levelState(
  level: LevelRow,
  map: MapRow,
  cleared: Set<string>,
  zoneUnlocked: boolean,
): LevelState {
  if (cleared.has(level.id)) return 'cleared';
  // Le niveau 1 n'est disponible que si la zone est débloquée (zone précédente finie).
  if (level.level_index === 1) return zoneUnlocked ? 'available' : 'locked';
  const prev = map.levels.find((l) => l.level_index === level.level_index - 1);
  if (prev && cleared.has(prev.id)) return 'available';
  return 'locked';
}

export function MapsScreen() {
  const { data: maps, isLoading: mapsLoading } = useMaps();
  const { data: cleared } = useLevelProgress();
  const { data: deployments } = useDeployments();
  const { data: heroes } = useHeroes();
  const { data: borrowable } = useBorrowableHeroes();
  const { data: borrowUsage } = useBorrowUsage();
  const borrowByIdTop = new Map((borrowable ?? []).map((b) => [b.hero_id, b]));
  /** Nom du renfort épuisé sur la carte dans ce groupe (ou null). */
  function borrowExhaustedName(heroIds: string[]): string | null {
    const id = heroIds.find((h) => borrowByIdTop.has(h) && mapFightsLeft(borrowUsage, h) <= 0);
    return id ? (borrowByIdTop.get(id)?.name ?? 'Renfort') : null;
  }
  const actions = useDeploymentActions();

  const [deployTarget, setDeployTarget] = useState<{ level: LevelRow; map: MapRow } | null>(null);
  const [replay, setReplay] = useState<StoredCombat | null>(null);
  const [fightView, setFightView] = useState<FightResponse | null>(null);
  const [fightError, setFightError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Cooldown d'assaut affiché : échéance PUREMENT LOCALE (Date.now() du client
  // comparé à un instant client), jamais l'heure serveur. On repart de l'instant
  // où l'on observe localement qu'un combat vient d'avoir lieu (ou du délai
  // `retry_after` renvoyé par le serveur sur un 429). L'ENFORCEMENT reste 100 %
  // serveur ; ceci n'est qu'un indicateur d'UI insensible à l'horloge du PC.
  const [cooldownUntil, setCooldownUntil] = useState<Record<string, number>>({});

  const clearedSet = cleared ?? new Set<string>();
  const heroList = heroes ?? [];
  const deps = deployments ?? [];
  const mapList = maps ?? [];

  // Horloge live (1 s) pour les combats en attente et le cooldown d'assaut.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deps.length === 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [deps.length]);

  // Signaux pour le tutoriel : « modale de déploiement ouverte ». (Le « héros
  // composé » est signalé depuis la modale elle-même.) Réinitialisé à la fermeture.
  const setTourDeployModalOpen = useTourSignals((s) => s.setDeployModalOpen);
  const setTourDeployHeroChosen = useTourSignals((s) => s.setDeployHeroChosen);
  useEffect(() => {
    setTourDeployModalOpen(Boolean(deployTarget));
    if (!deployTarget) setTourDeployHeroChosen(false);
  }, [deployTarget, setTourDeployModalOpen, setTourDeployHeroChosen]);

  // Signaux tutoriel pour la fenêtre de combat : ouverte / terminée.
  const setTourFightOpen = useTourSignals((s) => s.setFightOpen);
  const setTourFightDone = useTourSignals((s) => s.setFightDone);
  useEffect(() => {
    setTourFightOpen(Boolean(fightView));
    if (!fightView) setTourFightDone(false);
  }, [fightView, setTourFightOpen, setTourFightDone]);

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

  // Une zone est débloquée si c'est la première, ou si la zone précédente (ordre
  // 'sort', reflété par l'ordre de mapList) est ENTIÈREMENT terminée.
  function zoneUnlocked(map: MapRow): boolean {
    const idx = mapList.findIndex((m) => m.id === map.id);
    if (idx <= 0) return true;
    const prev = mapList[idx - 1];
    return !!prev && prev.levels.every((l) => clearedSet.has(l.id));
  }

  // Jalon d'onboarding « première défaite » : piloté par l'UI (fin/abandon du combat).
  const recordDefeat = useOnboardingStore((s) => s.recordDefeat);
  const queryClient = useQueryClient();

  // Encaisse les récompenses accumulées par TOUS les groupes en boucle (le claim
  // serveur est global), puis rafraîchit l'affichage des gains. Plus d'auto-
  // collecte : on ne banque plus qu'à la demande, via le bouton « Récupérer »
  // d'un groupe. Le serveur accumule jusqu'à OFFLINE_FIGHT_CAP (12 h), donc rien
  // n'est perdu entre deux passages.
  // Récap de la dernière récolte auto (affiché après « Récupérer »).
  const [harvest, setHarvest] = useState<ClaimResponse | null>(null);
  const claimingRef = useRef(false);
  const bankRewards = async (deploymentId?: string): Promise<ClaimResponse | null> => {
    if (claimingRef.current) return null;
    claimingRef.current = true;
    try {
      const data = await actions.claim.mutateAsync(deploymentId);
      // Filet pour le mode boucle (combats non regardés) : un groupe wipé = défaite.
      if (data.results.some((r) => r.blocked)) recordDefeat();
      return data;
    } finally {
      claimingRef.current = false;
      void queryClient.refetchQueries({ queryKey: ['profile'] });
      void queryClient.refetchQueries({ queryKey: ['heroes'] });
      void queryClient.refetchQueries({ queryKey: ['resources'] });
    }
  };

  // « Récupérer » : encaisse les gains de CE groupe et affiche le récap, SANS le
  // retirer — la team continue de farmer. Ciblé au groupe (les autres ne sont pas
  // encaissés) → le récap ne montre bien que ce que cette équipe a farmé.
  const recoverOnly = async (deploymentId: string) => {
    const data = await bankRewards(deploymentId);
    if (data && harvestHasLoot(data)) setHarvest(data);
  };

  // « Replis » : encaisse les gains de CE groupe PUIS le retire. L'ordre importe —
  // on banque AVANT de retirer, sinon les combats accumulés seraient perdus.
  const recoverAndRemove = async (deploymentId: string) => {
    await recoverOnly(deploymentId);
    actions.undeploy.mutate(deploymentId);
  };

  /**
   * Bascule farm auto ⇄ assauts manuels.
   *
   * Le farm en attente n'est PLUS perdu : c'est le serveur qui règle le groupe
   * avant de réécrire son ancre (action `setmode`). Cet encaissement côté client
   * est donc du CONFORT — il sert à afficher le récap de récolte (avec le détail
   * des matériaux, que la réponse de `setmode` ne porte pas). En best-effort : s'il
   * échoue, on bascule quand même, le serveur encaissera de toute façon.
   */
  const toggleMode = async (dep: DeploymentRow) => {
    if (dep.mode === 'loop') {
      try {
        const data = await bankRewards(dep.id);
        if (data && harvestHasLoot(data)) setHarvest(data);
      } catch {
        /* le serveur encaisse quand même dans `setmode` — on n'annule pas la bascule */
      }
    }
    actions.setMode.mutate({
      deploymentId: dep.id,
      mode: dep.mode === 'advance' ? 'loop' : 'advance',
    });
  };

  // Groupes en farm auto (toutes zones confondues) — cible des actions globales.
  const loopDeps = deps.filter((d) => d.mode === 'loop');
  // Au moins un groupe a-t-il des gains en attente ? (même règle que par groupe :
  // grise « Tout récupérer » quand il n'y a rien à encaisser).
  const anyPending = loopDeps.some(
    (d) => fightsForElapsed(Math.max(0, (now - Date.parse(d.last_resolved_at)) / 1000)) > 0,
  );

  // « Tout récupérer » : encaisse TOUS les groupes en boucle d'un coup (claim
  // serveur global, sans deployment_id) sans retirer personne — tout continue de farmer.
  const recoverAll = async () => {
    const data = await bankRewards();
    if (data && harvestHasLoot(data)) setHarvest(data);
  };

  // « Tout replier » : encaisse tout PUIS retire tous les groupes en boucle.
  const retreatAll = async () => {
    await recoverAll();
    for (const d of loopDeps) actions.undeploy.mutate(d.id);
  };

  // Déploiement dont on regarde l'assaut en cours (pour le confirmer/abandonner).
  const fightDepRef = useRef<string | null>(null);

  const onFight = (dep: DeploymentRow) => {
    setFightError(null);
    fightDepRef.current = dep.id;
    actions.fight.mutate(dep.id, {
      onSuccess: (data) => {
        // Un combat vient d'avoir lieu (observé localement) → on gèle le bouton
        // pour la durée du cooldown, mesurée en temps LOCAL (aucune heure serveur).
        setCooldownUntil((m) => ({ ...m, [dep.id]: Date.now() + FIGHT_COOLDOWN_SECONDS * 1000 }));
        setFightView(data);
      },
      onError: (e) => {
        // 429 = cooldown serveur encore actif (typiquement après un reload où
        // l'échéance locale est perdue) : on réaligne l'indicateur sur le délai
        // renvoyé par le serveur, toujours en temps local.
        const retry = e instanceof DeploymentError ? e.retryAfter : undefined;
        if (typeof retry === 'number') {
          setCooldownUntil((m) => ({ ...m, [dep.id]: Date.now() + retry * 1000 }));
        }
        setFightError(e instanceof Error ? e.message : 'Erreur');
      },
    });
  };

  /**
   * Clôt l'assaut regardé. `abandoned=false` = combat mené à son terme,
   * `abandoned=true` = abandon avant la fin. La DÉFAITE (jalon d'onboarding) n'est
   * prise en compte qu'ICI, à la fin du combat en UI : un abandon compte comme une
   * défaite, tout comme un combat perdu regardé jusqu'au bout.
   */
  const confirmFight = (abandoned: boolean) => {
    const depId = fightDepRef.current;
    const lost = abandoned || fightView?.result === 'loss';
    fightDepRef.current = null;
    setFightView(null);
    if (lost) recordDefeat();
    if (depId) actions.resolveFight.mutate({ deploymentId: depId, abandoned });
  };

  // Groupes déployés dans la zone actuellement sélectionnée.
  const selectedDeps = selectedMap
    ? deps.filter((d) => selectedMap.levels.some((l) => l.id === d.level_id))
    : [];

  // Farm en cours dans la zone (mode boucle) → anime la scène + montre les héros.
  const zoneLoopDep =
    selectedDeps.find((d) => d.mode === 'loop' && !d.blocked) ??
    selectedDeps.find((d) => d.mode === 'loop') ??
    null;
  const farmClasses = zoneLoopDep
    ? zoneLoopDep.hero_ids
        .map((id) => heroById(id)?.classId)
        .filter((c): c is string => Boolean(c))
    : [];
  // Monstre affiché dans la scène de farm = celui du niveau en boucle (à défaut, le boss de zone).
  const farmEnemyName =
    (zoneLoopDep && selectedMap?.levels.find((l) => l.id === zoneLoopDep.level_id)?.enemyName) ||
    selectedMap?.levels.find((l) => l.isBoss)?.enemyName ||
    '';

  return (
    <section className="anim-fade flex h-full min-h-0 flex-col gap-4">
      <BackToActivities />
      <div className="shrink-0">
        <h2 className="heading text-2xl">Carte du monde</h2>
        <p className="text-sm text-[var(--color-muted)]">
          Choisis une zone, déploie tes escouades. Avancer : combats visibles. Boucle : farm
          automatique, gains récoltés tout seuls.
        </p>
      </div>

      {/* Actions globales sur TOUS les groupes en farm auto (toutes zones). */}
      {loopDeps.length > 0 && (
        <div className="shrink-0 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-edge)] bg-black/20 p-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
            <UiIcon name="loop" size={13} color="currentColor" />
            {loopDeps.length} groupe{loopDeps.length > 1 ? 's' : ''} en farm auto
          </span>
          <span className="flex-1" />
          <button
            onClick={() => void recoverAll()}
            disabled={actions.claim.isPending || actions.undeploy.isPending || !anyPending}
            className="btn btn-primary px-3 py-1.5 text-xs"
            title={
              anyPending
                ? 'Encaisse les gains de TOUS les groupes en farm ; les équipes continuent'
                : 'Rien à encaisser pour le moment'
            }
          >
            <UiIcon name="gold" size={13} color="currentColor" /> Tout récupérer
          </button>
          <button
            onClick={() => void retreatAll()}
            disabled={actions.claim.isPending || actions.undeploy.isPending}
            className="btn btn-ghost px-3 py-1.5 text-xs"
            title="Encaisse les gains de TOUS les groupes en farm puis les retire"
          >
            <UiIcon name="loop" size={13} color="currentColor" /> Tout replier
          </button>
        </div>
      )}

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
                farming={map.levels.some((l) => depByLevel.get(l.id) === 'loop')}
                onClick={() => setSelectedId(map.id)}
              />
            ))}
          </div>
        </div>

        {/* Colonne droite : détail immersif de la zone */}
        {selectedMap && (
          <div data-tour="map-deploy" className="min-w-0 flex-1 space-y-4">
            <ZoneDetail
              map={selectedMap}
              clearedSet={clearedSet}
              zoneUnlocked={zoneUnlocked(selectedMap)}
              depByLevel={depByLevel}
              onPick={(level) =>
                levelState(level, selectedMap, clearedSet, zoneUnlocked(selectedMap)) !== 'locked' &&
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
                    cooldownLeft={Math.max(0, Math.ceil(((cooldownUntil[dep.id] ?? 0) - now) / 1000))}
                    maps={mapList}
                    heroById={heroById}
                    borrowExhausted={borrowExhaustedName(dep.hero_ids)}
                    onToggleMode={() => void toggleMode(dep)}
                    onFight={() => onFight(dep)}
                    fighting={actions.fight.isPending}
                    onReplay={() => {
                      if (dep.last_combat) setReplay(dep.last_combat as StoredCombat);
                    }}
                    onRemove={() => actions.undeploy.mutate(dep.id)}
                    onRecover={() => void recoverOnly(dep.id)}
                    onRetreat={() => void recoverAndRemove(dep.id)}
                    busy={
                      actions.setMode.isPending ||
                      actions.undeploy.isPending ||
                      actions.claim.isPending
                    }
                  />
                ))
              )}
            </div>

            {/* Illustration de la zone (s'anime quand une escouade y farme) */}
            <ZoneScene
              map={selectedMap}
              farming={Boolean(zoneLoopDep)}
              heroClasses={farmClasses}
              enemyName={farmEnemyName}
            />
          </div>
        )}
      </div>

      {deployTarget && (
        <DeployModal
          level={deployTarget.level}
          heroes={heroList}
          borrowable={borrowable ?? []}
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
      {/* Retour immédiat pendant que le serveur calcule le combat : la fenêtre
          s'ouvre tout de suite (ressenti « instant ») avant l'arrivée du replay. */}
      {actions.fight.isPending && !fightView && (
        <BodyPortal>
        <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="panel anim-pop flex flex-col items-center gap-3 p-8 text-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--color-edge)] border-t-[var(--color-gold-soft)]" />
            <div className="font-display text-sm font-semibold text-[var(--color-ink)]">
              Préparation du combat…
            </div>
            <div className="text-[11px] text-[var(--color-muted)]">L'escouade se met en position</div>
          </div>
        </div>
        </BodyPortal>
      )}
      {fightView && (
        <CombatReplay
          combat={fightView.combat}
          live
          tourAnchors
          onDone={() => setTourFightDone(true)}
          title={`Assaut — ${fightView.rewards.level_name || 'combat'}`}
          footer={
            <>
              {fightView.result === 'win' && (
                <p className="mb-1 text-[11px] text-[var(--color-muted)]">
                  Gains appliqués une fois le combat validé.
                </p>
              )}
              <FightRewardsFooter rewards={fightView.rewards} />
              <button
                data-tour="tour-combat-confirm"
                onClick={() => confirmFight(false)}
                className="btn btn-primary mt-3 text-sm"
              >
                {fightView.result === 'win' ? 'Valider la victoire' : 'Continuer'}
              </button>
            </>
          }
          // Fermer sans finir (bouton « Abandonner » du live) = abandon → défaite.
          onClose={() => confirmFight(true)}
        />
      )}

      {harvest && <HarvestSummaryModal claim={harvest} onClose={() => setHarvest(null)} />}
    </section>
  );
}

/* ---------------------------------------------------- scène de zone (SVG) -- */

/**
 * Mêlée de farm : escouade (silhouettes de classe reconnaissables) à gauche qui
 * charge un monstre de zone à droite. Chaque héros de mêlée fait un pas en avant
 * rythmé (fente), les distants restent en retrait ; un éclat d'impact ponctue les
 * échanges. Réutilise <FighterSprite>/<EnemySprite> (mêmes avatars qu'en combat).
 */
function FarmMelee({ classes, accent, enemyName }: { classes: string[]; accent: string; enemyName: string }) {
  const gy = 170;
  return (
    <g>
      {classes.map((c, i) => {
        const melee = fighterKind(c) === 'melee';
        // Mêlée : au front, avec fente vers l'ennemi. Distant : en retrait, léger balancement.
        const x = melee ? 300 + i * 26 : 250 + i * 24;
        const lunge = melee ? '0 0; 10 0; 0 0' : '0 0; -3 0; 0 0';
        return (
          <g key={i} transform={`translate(${x},${gy})`}>
            <g>
              <animateTransform attributeName="transform" type="translate" values={lunge} dur="1.2s" begin={`${i * 0.16}s`} repeatCount="indefinite" additive="sum" />
              <FighterSprite classId={c} size={40} />
            </g>
          </g>
        );
      })}
      <g transform={`translate(500,${gy})`}>
        <g>
          <animateTransform attributeName="transform" type="translate" values="0 0; -6 0; 2 0; 0 0" dur="1.2s" begin="0.4s" repeatCount="indefinite" additive="sum" />
          <EnemySprite accent={accent} name={enemyName} size={44} />
        </g>
      </g>
      {/* Éclat d'impact au contact */}
      <circle cx="470" cy="152" r="0" fill="#fff6d0" filter="url(#zs-glow)">
        <animate attributeName="r" values="0;8;0" dur="1.2s" begin="0.2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0;0.9;0" dur="1.2s" begin="0.2s" repeatCount="indefinite" />
      </circle>
    </g>
  );
}

type PMode = 'float' | 'rise' | 'fall' | 'blow';
type ZoneTheme = {
  kind: string;
  skyTop: string;
  skyBottom: string;
  hillFar: string;
  hillMid: string;
  ground: string;
  mist: string;
  particle: string;
  pmode: PMode;
  light: 'moon' | 'sun' | 'crystal' | 'orb' | 'none';
  stars: boolean;
};

// Un décor par zone (id de map). Silhouettes distinctives dans renderFore().
const ZONE_THEMES: Record<string, ZoneTheme> = {
  forest: { kind: 'forest', skyTop: '#0f1c22', skyBottom: '#173026', hillFar: '#173029', hillMid: '#0f231d', ground: '#0b1710', mist: '#7fd0c0', particle: '#b8ff9a', pmode: 'float', light: 'moon', stars: true },
  caverns: { kind: 'caverns', skyTop: '#0a1420', skyBottom: '#0f2334', hillFar: '#122234', hillMid: '#0d1a28', ground: '#0b1826', mist: '#9fe6ef', particle: '#dff6ff', pmode: 'fall', light: 'crystal', stars: false },
  desert: { kind: 'desert', skyTop: '#38243c', skyBottom: '#b0672f', hillFar: '#7a4a24', hillMid: '#5a3418', ground: '#4a2c16', mist: '#f2c98a', particle: '#ffe0a0', pmode: 'blow', light: 'sun', stars: false },
  swamp: { kind: 'swamp', skyTop: '#0f1a14', skyBottom: '#1e2c18', hillFar: '#173020', hillMid: '#0f2014', ground: '#0c160f', mist: '#8fbf6a', particle: '#c8ff9a', pmode: 'rise', light: 'moon', stars: true },
  volcano: { kind: 'volcano', skyTop: '#1c0a08', skyBottom: '#6a2612', hillFar: '#2a1210', hillMid: '#180a0b', ground: '#140809', mist: '#ff8a4a', particle: '#ff9a3a', pmode: 'rise', light: 'none', stars: false },
  ruins: { kind: 'ruins', skyTop: '#0c2028', skyBottom: '#123638', hillFar: '#123234', hillMid: '#0d2224', ground: '#0b1c1e', mist: '#7fd8d0', particle: '#9ff0e0', pmode: 'rise', light: 'moon', stars: true },
  abyss: { kind: 'abyss', skyTop: '#05101f', skyBottom: '#0a2036', hillFar: '#0a1e30', hillMid: '#071523', ground: '#06121e', mist: '#5aa0d8', particle: '#8fd8ff', pmode: 'rise', light: 'crystal', stars: false },
  sky: { kind: 'sky', skyTop: '#31406f', skyBottom: '#8892c0', hillFar: '#9aa2cc', hillMid: '#b4bce0', ground: '#6a6f98', mist: '#eef2ff', particle: '#ffffff', pmode: 'fall', light: 'sun', stars: false },
  shadow: { kind: 'shadow', skyTop: '#120a1e', skyBottom: '#241234', hillFar: '#1a1030', hillMid: '#0e081c', ground: '#0a0614', mist: '#a678e0', particle: '#c79aff', pmode: 'float', light: 'none', stars: true },
  celestial: { kind: 'celestial', skyTop: '#0a0a22', skyBottom: '#20183c', hillFar: '#1a1436', hillMid: '#100c26', ground: '#0c0a1e', mist: '#c0a8ff', particle: '#ffe08a', pmode: 'float', light: 'orb', stars: true },
};

/** Particules d'ambiance selon le mode (flotte / monte / tombe / souffle). */
function Particles({ color, mode }: { color: string; mode: PMode }) {
  const pts: [number, number][] = [[80, 120], [200, 110], [300, 132], [430, 118], [560, 126], [620, 108], [150, 142], [500, 116], [360, 128], [250, 150], [600, 150]];
  return (
    <>
      {pts.map(([x, y], i) => {
        const d = 3 + (i % 3);
        const b = `${i * 0.3}s`;
        const anim =
          mode === 'rise' ? (
            <>
              <animateTransform attributeName="transform" type="translate" values="0 0; 0 -64" dur={`${d + 1}s`} begin={b} repeatCount="indefinite" additive="sum" />
              <animate attributeName="opacity" values="0;0.9;0" dur={`${d + 1}s`} begin={b} repeatCount="indefinite" />
            </>
          ) : mode === 'fall' ? (
            <>
              <animateTransform attributeName="transform" type="translate" values="0 -30; 0 64" dur={`${d + 2}s`} begin={b} repeatCount="indefinite" additive="sum" />
              <animate attributeName="opacity" values="0;0.8;0" dur={`${d + 2}s`} begin={b} repeatCount="indefinite" />
            </>
          ) : mode === 'blow' ? (
            <>
              <animateTransform attributeName="transform" type="translate" values="-50 0; 70 -8" dur={`${d}s`} begin={b} repeatCount="indefinite" additive="sum" />
              <animate attributeName="opacity" values="0;0.7;0" dur={`${d}s`} begin={b} repeatCount="indefinite" />
            </>
          ) : (
            <>
              <animateTransform attributeName="transform" type="translate" values="0 0; 0 -8; 0 0" dur={`${d}s`} begin={b} repeatCount="indefinite" additive="sum" />
              <animate attributeName="opacity" values="0.3;1;0.3" dur={`${2.4 + (i % 3)}s`} begin={b} repeatCount="indefinite" />
            </>
          );
        return (
          <circle key={i} cx={x} cy={y} r={i % 2 ? 1.6 : 1.1} fill={i % 4 === 0 ? '#ffe6a8' : color} filter="url(#zs-glow)">
            {anim}
          </circle>
        );
      })}
    </>
  );
}

/** Source de lumière de la zone. */
function ZoneLight({ kind }: { kind: ZoneTheme['light'] }) {
  if (kind === 'sun')
    return (
      <g>
        <circle cx="574" cy="46" r="42" fill="#ffcf7a" opacity="0.16" filter="url(#zs-blur)" />
        {[0, 1, 2, 3, 4].map((i) => (
          <polygon key={i} points={`574,46 ${520 - i * 70},230 ${548 - i * 70},230`} fill="#ffdf9a" opacity="0.05" />
        ))}
        <circle cx="574" cy="46" r="18" fill="#ffe6a8" />
      </g>
    );
  if (kind === 'moon')
    return (
      <>
        <circle cx="580" cy="42" r="30" fill="#eef0ff" opacity="0.1" filter="url(#zs-blur)" />
        <circle cx="580" cy="42" r="16" fill="#f2ecd6" opacity="0.85" />
        <circle cx="574" cy="38" r="13" fill="url(#zs-sky)" opacity="0.5" />
      </>
    );
  if (kind === 'crystal')
    return (
      <g>
        <line x1="340" y1="0" x2="340" y2="26" stroke="#2a3a4a" strokeWidth="3" />
        <polygon points="340,18 350,32 340,48 330,32" fill="#8fe6ff" filter="url(#zs-glow)">
          <animate attributeName="opacity" values="0.7;1;0.7" dur="2.6s" repeatCount="indefinite" />
        </polygon>
      </g>
    );
  if (kind === 'orb')
    return (
      <g>
        <circle cx="480" cy="60" r="46" fill="#c9a8ff" opacity="0.16" filter="url(#zs-blur)" />
        <ellipse cx="480" cy="60" rx="42" ry="13" fill="none" stroke="#c0a8ff" strokeWidth="1" opacity="0.5">
          <animateTransform attributeName="transform" type="rotate" values="0 480 60;360 480 60" dur="24s" repeatCount="indefinite" />
        </ellipse>
        <ellipse cx="480" cy="60" rx="30" ry="9" fill="none" stroke="#ffe08a" strokeWidth="1" opacity="0.4">
          <animateTransform attributeName="transform" type="rotate" values="60 480 60;-300 480 60" dur="18s" repeatCount="indefinite" />
        </ellipse>
        <circle cx="480" cy="60" r="15" fill="#ffe08a" filter="url(#zs-glow)">
          <animate attributeName="opacity" values="0.75;1;0.75" dur="3s" repeatCount="indefinite" />
        </circle>
      </g>
    );
  return null;
}

/** Silhouettes distinctives du premier plan, propres à chaque zone. */
function renderFore(kind: string) {
  const gy = 170;
  switch (kind) {
    case 'caverns': {
      const stac: [number, number][] = [[60, 36], [130, 22], [240, 42], [330, 20], [430, 32], [540, 46], [640, 26], [190, 28], [500, 24]];
      const stag: [number, number][] = [[40, 30], [120, 20], [220, 38], [300, 18], [470, 34], [560, 26], [650, 22]];
      const crystals: [number, number][] = [[92, 158], [598, 160], [300, 160]];
      return (
        <g>
          {/* Lac gelé */}
          <ellipse cx="340" cy="196" rx="150" ry="12" fill="#123a4a" opacity="0.6" />
          <ellipse cx="340" cy="194" rx="120" ry="4" fill="#6fd6e6" opacity="0.25" />
          {stac.map(([x, len], i) => (
            <polygon key={`c${i}`} points={`${x - 7},0 ${x + 7},0 ${x},${len}`} fill="#122234" />
          ))}
          {stac.slice(0, 6).map(([x, len], i) => (
            <polygon key={`ci${i}`} points={`${x - 3},0 ${x + 3},0 ${x},${len * 0.7}`} fill="#2b5b6e" opacity="0.7" />
          ))}
          {/* Gouttes qui tombent */}
          {[130, 430, 540].map((x, i) => (
            <circle key={`dr${i}`} cx={x} cy={0} r="1.6" fill="#8fe6ff">
              <animate attributeName="cy" values="30;190" dur="3s" begin={`${i}s`} repeatCount="indefinite" />
              <animate attributeName="opacity" values="0;1;1;0" dur="3s" begin={`${i}s`} repeatCount="indefinite" />
            </circle>
          ))}
          {stag.map(([x, h], i) => (
            <polygon key={`g${i}`} points={`${x - 9},${gy} ${x},${gy - h} ${x + 9},${gy}`} fill="#0f2030" />
          ))}
          {stag.map(([x, h], i) => (
            <polygon key={`gi${i}`} points={`${x - 4},${gy} ${x},${gy - h * 0.7} ${x + 4},${gy}`} fill="#2b5b6e" opacity="0.55" />
          ))}
          {/* Cristaux lumineux */}
          {crystals.map(([x, y], i) => (
            <g key={`cr${i}`}>
              <polygon points={`${x},${y - 14} ${x + 5},${y} ${x},${y + 6} ${x - 5},${y}`} fill="#2b6b74" />
              <polygon points={`${x},${y - 14} ${x + 2},${y} ${x},${y + 6} ${x - 2},${y}`} fill="#8fe6ff" filter="url(#zs-glow)">
                <animate attributeName="opacity" values="0.5;1;0.5" dur={`${2.5 + i}s`} repeatCount="indefinite" />
              </polygon>
            </g>
          ))}
        </g>
      );
    }
    case 'desert': {
      const cacti = [70, 150, 590, 640];
      return (
        <g>
          {/* Pyramide lointaine */}
          <polygon points="424,150 496,150 460,110" fill="#6a3f1e" opacity="0.85" />
          <polygon points="460,110 496,150 478,150" fill="#5a341a" opacity="0.85" />
          {/* Mesa rocheux */}
          <path d="M300,170 L300,150 L316,150 L316,140 L360,140 L360,150 L376,150 L376,170 Z" fill="#5a3418" />
          {/* Colonne brisée + bloc */}
          <g transform="translate(232,170)">
            <rect x={-6} y={-30} width={12} height={30} fill="#7a5228" />
            <rect x={-8} y={-34} width={16} height={4} fill="#8a5f2f" />
          </g>
          <rect x="202" y="162" width="20" height="8" fill="#7a5228" />
          {cacti.map((x, i) => (
            <g key={i} transform={`translate(${x},${gy})`}>
              <rect x={-3} y={-26} width={6} height={26} rx={3} fill="#2f4a24" />
              <rect x={-11} y={-18} width={5} height={10} rx={2.5} fill="#2f4a24" />
              <rect x={-11} y={-20} width={5} height={4} rx={2} fill="#2f4a24" />
              <rect x={6} y={-22} width={5} height={12} rx={2.5} fill="#2f4a24" />
              <rect x={6} y={-24} width={5} height={4} rx={2} fill="#2f4a24" />
            </g>
          ))}
          {/* Crâne dans le sable */}
          <g transform="translate(412,166)">
            <circle cx="0" cy="0" r="5" fill="#d8c9a8" />
            <rect x={-4} y={2} width={8} height={4} fill="#d8c9a8" />
            <circle cx={-2} cy={-1} r="1.3" fill="#3a2c18" />
            <circle cx={2} cy={-1} r="1.3" fill="#3a2c18" />
          </g>
        </g>
      );
    }
    case 'swamp': {
      const trees: [number, number][] = [[60, 1], [150, 0.8], [600, 0.9], [650, 0.7]];
      return (
        <g>
          {[120, 330, 520].map((x, i) => (
            <g key={`w${i}`}>
              <ellipse cx={x} cy={198} rx={54} ry={9} fill="#0e241a" />
              <ellipse cx={x} cy={195} rx={40} ry={3} fill="#3a6a4a" opacity="0.4" />
              <ellipse cx={x - 16} cy={196} rx={7} ry={3} fill="#1e4a2a" />
              <ellipse cx={x + 14} cy={198} rx={6} ry={2.5} fill="#1e4a2a" />
            </g>
          ))}
          {/* Cabane en ruine */}
          <g transform="translate(300,170)">
            <rect x={-20} y={-26} width={40} height={26} fill="#0e1a12" />
            <polygon points="-24,-26 0,-40 24,-26" fill="#152218" />
            <rect x={-6} y={-14} width={12} height={14} fill="#050a06" />
          </g>
          {trees.map(([x, s], i) => (
            <g key={i} transform={`translate(${x},${gy})`}>
              <rect x={-2 * s} y={-30 * s} width={4 * s} height={30 * s} fill="#0e1a12" />
              <path d={`M0,${-24 * s} L${-14 * s},${-32 * s}`} stroke="#0e1a12" strokeWidth={2 * s} />
              <path d={`M0,${-20 * s} L${12 * s},${-30 * s}`} stroke="#0e1a12" strokeWidth={2 * s} />
              <path d={`M0,${-28 * s} L${8 * s},${-40 * s}`} stroke="#0e1a12" strokeWidth={2 * s} />
            </g>
          ))}
          {/* Feux follets */}
          {[90, 240, 470, 560].map((x, i) => (
            <circle key={`wisp${i}`} cx={x} cy={150} r="3" fill="#9fff8a" filter="url(#zs-glow)">
              <animate attributeName="cy" values="150;140;150" dur={`${4 + i}s`} repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.4;1;0.4" dur={`${3 + i}s`} repeatCount="indefinite" />
            </circle>
          ))}
          {[40, 90, 560, 610, 300].map((x, i) => (
            <line key={`r${i}`} x1={x} y1={gy} x2={x - 3} y2={gy - 16} stroke="#1e3a1e" strokeWidth="1.5" />
          ))}
        </g>
      );
    }
    case 'volcano': {
      const bombs: [number, number][] = [[300, 62], [382, 56]];
      return (
        <g>
          {/* Halo de chaleur */}
          <ellipse cx="340" cy="150" rx="150" ry="76" fill="#ff4500" opacity="0.12" filter="url(#zs-blur)" />
          {/* Grand cône */}
          <polygon points="228,170 340,64 452,170" fill="#1a0c0c" />
          <polygon points="300,110 380,110 340,64" fill="#241010" />
          {/* Cratère incandescent */}
          <ellipse cx="340" cy="80" rx="24" ry="7" fill="#ff6a1e" filter="url(#zs-glow)">
            <animate attributeName="opacity" values="0.7;1;0.7" dur="1.6s" repeatCount="indefinite" />
          </ellipse>
          {/* Coulées de lave sur les flancs */}
          <path d="M330,86 Q322,120 328,150 Q332,164 326,170" fill="none" stroke="#ff7a2a" strokeWidth="4" filter="url(#zs-glow)" />
          <path d="M352,88 Q362,124 356,150 Q352,164 360,170" fill="none" stroke="#ff9a3a" strokeWidth="3" filter="url(#zs-glow)" />
          {/* Fontaine de lave */}
          {[330, 340, 350].map((x, i) => (
            <circle key={`fx${i}`} cx={x} cy={80} r="2.5" fill="#ffcf5a">
              <animate attributeName="cy" values="80;52;80" dur={`${1.6 + i * 0.3}s`} repeatCount="indefinite" />
              <animate attributeName="opacity" values="1;0.4;1" dur={`${1.6 + i * 0.3}s`} repeatCount="indefinite" />
            </circle>
          ))}
          {/* Bombes volcaniques en arc */}
          {bombs.map(([x, y], i) => (
            <circle key={`bm${i}`} cx={x} cy={y} r="2" fill="#ff8a2a" filter="url(#zs-glow)">
              <animateMotion path={`M0,0 q ${i ? -34 : 34},-30 ${i ? -70 : 70},46`} dur={`${3 + i}s`} repeatCount="indefinite" />
              <animate attributeName="opacity" values="1;1;0" dur={`${3 + i}s`} repeatCount="indefinite" />
            </circle>
          ))}
          {/* Panache de fumée */}
          {[0, 1, 2, 3].map((i) => (
            <circle key={`sm${i}`} cx={340} cy={74} r="7" fill="#2a1e1e" opacity="0">
              <animate attributeName="cy" values="74;18" dur="5s" begin={`${i * 1.2}s`} repeatCount="indefinite" />
              <animate attributeName="cx" values="340;320" dur="5s" begin={`${i * 1.2}s`} repeatCount="indefinite" />
              <animate attributeName="r" values="4;16" dur="5s" begin={`${i * 1.2}s`} repeatCount="indefinite" />
              <animate attributeName="opacity" values="0;0.5;0" dur="5s" begin={`${i * 1.2}s`} repeatCount="indefinite" />
            </circle>
          ))}
          {/* Rochers d'obsidienne (cadre) */}
          <path d="M0,170 L36,128 L64,150 L96,120 L128,170 Z" fill="#120809" />
          <path d="M680,170 L640,120 L610,148 L578,124 L548,170 Z" fill="#120809" />
          {/* Rivière de lave au sol */}
          <rect x="0" y="186" width="680" height="14" fill="#ff5a1e" opacity="0.55" filter="url(#zs-glow)">
            <animate attributeName="opacity" values="0.4;0.65;0.4" dur="2.4s" repeatCount="indefinite" />
          </rect>
          <path d="M0,186 Q170,180 340,186 Q510,192 680,184" fill="none" stroke="#ffcf5a" strokeWidth="2" opacity="0.7" />
          {[120, 300, 470, 560].map((x, i) => (
            <circle key={`bu${i}`} cx={x} cy={190} r="2.6" fill="#ffdf7a">
              <animate attributeName="cy" values="192;185;192" dur={`${1.4 + i * 0.3}s`} repeatCount="indefinite" />
            </circle>
          ))}
          {/* Fissures incandescentes */}
          {[90, 240, 430, 600].map((x, i) => (
            <polyline key={`cr${i}`} points={`${x},170 ${x + 6},178 ${x - 4},184 ${x + 8},192`} fill="none" stroke="#ff7a2a" strokeWidth="2" filter="url(#zs-glow)" />
          ))}
        </g>
      );
    }
    case 'ruins': {
      const cols: [number, number][] = [[60, 44], [150, 30], [560, 40], [640, 28]];
      return (
        <g>
          {/* Rais de lumière filtrant l'eau */}
          {[160, 360, 520].map((x, i) => (
            <polygon key={`ls${i}`} points={`${x - 16},0 ${x + 16},0 ${x + 40},170 ${x - 8},170`} fill="#7fd8d0" opacity="0.05" />
          ))}
          {/* Grande statue brisée */}
          <g transform="translate(300,170)">
            <rect x={-16} y={-56} width={32} height={56} fill="#0e2a2c" />
            <rect x={-20} y={-56} width={40} height={6} fill="#164246" />
            <circle cx="0" cy={-64} r="10" fill="#0e2a2c" />
            <rect x={-3} y={-64} width={6} height={2} fill="#164246" />
          </g>
          {/* Arche engloutie */}
          <path d="M400,170 L400,124 Q436,110 472,124 L472,170 L460,170 L460,132 Q436,120 412,132 L412,170 Z" fill="#123234" />
          {cols.map(([x, h], i) => (
            <g key={i} transform={`translate(${x},${gy})`}>
              <rect x={-8} y={-h} width={16} height={h} fill="#123234" />
              <rect x={-10} y={-h - 4} width={20} height={4} fill="#1a4244" />
              <rect x={-6} y={-h * 0.5} width={12} height={2} fill="#1a4244" opacity="0.6" />
            </g>
          ))}
          {/* Algues qui ondulent */}
          {[100, 250, 590].map((x, i) => (
            <path key={`k${i}`} d={`M${x},${gy} q6,-16 0,-30 q-6,-14 0,-24`} stroke="#1a5a4a" strokeWidth="3" fill="none">
              <animateTransform attributeName="transform" type="rotate" values={`-4 ${x} ${gy};4 ${x} ${gy};-4 ${x} ${gy}`} dur="4s" repeatCount="indefinite" />
            </path>
          ))}
          {/* Poisson qui passe */}
          <g>
            <animateTransform attributeName="transform" type="translate" values="0 0; 70 -8; 0 0" dur="9s" repeatCount="indefinite" additive="sum" />
            <ellipse cx="300" cy="118" rx="6" ry="3" fill="#2a6a6a" />
            <polygon points="294,118 288,114 288,122" fill="#2a6a6a" />
          </g>
        </g>
      );
    }
    case 'abyss': {
      const spires: [number, number][] = [[50, 52], [110, 34], [600, 50], [650, 30], [300, 60]];
      return (
        <g>
          {/* Léviathan lointain */}
          <path d="M120,120 Q220,96 360,110 Q500,124 600,104" fill="none" stroke="#0e2a44" strokeWidth="14" opacity="0.5" strokeLinecap="round" />
          <circle cx="150" cy="118" r="3" fill="#8fd8ff" opacity="0.5" filter="url(#zs-glow)" />
          {spires.map(([x, h], i) => (
            <polygon key={i} points={`${x - 10},${gy} ${x},${gy - h} ${x + 10},${gy}`} fill="#0a1e30" />
          ))}
          {/* Coraux */}
          {[160, 520].map((x, i) => (
            <path key={`c${i}`} transform={`translate(${x},${gy})`} d="M0,0 L0,-16 M0,-8 L-8,-18 M0,-8 L8,-18 M0,-14 L-5,-24 M0,-14 L5,-24" stroke="#2a6a8a" strokeWidth="2.5" fill="none" />
          ))}
          {/* Anémones */}
          {[240, 440].map((x, i) => (
            <g key={`an${i}`} transform={`translate(${x},${gy})`}>
              {[-6, -2, 2, 6].map((dx, j) => (
                <line key={j} x1={dx} y1="0" x2={dx * 1.6} y2="-14" stroke="#5a3a8a" strokeWidth="1.6" />
              ))}
            </g>
          ))}
          {/* Algues */}
          {[80, 380, 600].map((x, i) => (
            <path key={`k${i}`} d={`M${x},${gy} q6,-14 0,-28 q-6,-14 0,-26`} stroke="#124a44" strokeWidth="3" fill="none">
              <animateTransform attributeName="transform" type="rotate" values={`-3 ${x} ${gy};3 ${x} ${gy};-3 ${x} ${gy}`} dur="4s" repeatCount="indefinite" />
            </path>
          ))}
          {/* Lueur d'abysse (poisson-lanterne) */}
          <circle cx="470" cy="140" r="2.5" fill="#8fffe0" filter="url(#zs-glow)">
            <animate attributeName="opacity" values="0.4;1;0.4" dur="2.6s" repeatCount="indefinite" />
          </circle>
        </g>
      );
    }
    case 'sky': {
      const clouds: [number, number, number, string][] = [
        [90, 96, 1, '#aab6e0'], [250, 78, 1.3, '#9aa7db'], [470, 90, 1.1, '#b4bfec'],
        [600, 74, 0.9, '#9aa7db'], [360, 122, 1.2, '#cfd6f2'], [150, 134, 1, '#c6d0ee'],
      ];
      const cloud = (x: number, y: number, s: number, c: string, i: number) => (
        <g key={`cl${i}`}>
          <ellipse cx={x} cy={y + 6 * s} rx={34 * s} ry={9 * s} fill={c} />
          <circle cx={x - 16 * s} cy={y} r={11 * s} fill={c} />
          <circle cx={x} cy={y - 6 * s} r={15 * s} fill={c} />
          <circle cx={x + 16 * s} cy={y} r={12 * s} fill={c} />
        </g>
      );
      const isle = (x: number, y: number, w: number, k: string) => (
        <g key={k}>
          <ellipse cx={x} cy={y} rx={w / 2} ry={7} fill="#cfd6f0" />
          <path d={`M${x - w / 2},${y} L${x - w / 2 + 10},${y + 20} L${x + w / 2 - 10},${y + 20} L${x + w / 2},${y} Z`} fill="#6a72a0" />
          <path d={`M${x - 6},${y + 20} L${x},${y + 34} L${x + 6},${y + 20} Z`} fill="#4a5080" />
        </g>
      );
      return (
        <g>
          {clouds.map(([x, y, s, c], i) => cloud(x, y, s, c, i))}
          {/* Îlots latéraux + obélisques lumineux */}
          {isle(110, 150, 64, 'il1')}
          {isle(560, 152, 60, 'il2')}
          <rect x="106" y="126" width="8" height="24" fill="#e6ebff" />
          <polygon points="106,126 114,126 110,118" fill="#ffe6a8" filter="url(#zs-glow)" />
          <rect x="556" y="128" width="8" height="24" fill="#e6ebff" />
          <polygon points="556,128 564,128 560,120" fill="#ffe6a8" filter="url(#zs-glow)" />
          {/* Grand temple central flottant */}
          {isle(340, 138, 122, 'il0')}
          <polygon points="298,110 340,86 382,110" fill="#eef2ff" />
          <rect x="300" y="110" width="80" height="7" fill="#dbe1f6" />
          {[306, 322, 338, 354, 370].map((cx, i) => (
            <rect key={i} x={cx - 2.5} y="117" width="5" height="21" fill="#e6ebff" />
          ))}
          <rect x="300" y="136" width="80" height="4" fill="#cdd6f2" />
          {/* Oiseaux */}
          {[130, 190, 500].map((x, i) => (
            <path key={`b${i}`} d={`M${x},56 q4,-4 8,0 q4,-4 8,0`} stroke="#eef2ff" strokeWidth="1.5" fill="none">
              <animateTransform attributeName="transform" type="translate" values="0 0;14 -5;0 0" dur={`${5 + i}s`} repeatCount="indefinite" additive="sum" />
            </path>
          ))}
        </g>
      );
    }
    case 'shadow': {
      const spikes: [number, number][] = [[50, 54], [100, 36], [150, 48], [600, 52], [650, 34], [300, 60], [360, 40]];
      const isles: [number, number][] = [[120, 108], [560, 118]];
      const eyes: [number, number][] = [[210, 150], [470, 152]];
      return (
        <g>
          {/* Faille lumineuse */}
          <ellipse cx="340" cy="108" rx="30" ry="60" fill="#7a3ad0" opacity="0.14" filter="url(#zs-blur)" />
          <path d="M340,58 L332,108 L340,158 L348,108 Z" fill="#a678e0" opacity="0.5" filter="url(#zs-glow)">
            <animate attributeName="opacity" values="0.3;0.6;0.3" dur="3s" repeatCount="indefinite" />
          </path>
          {/* Îlots flottants */}
          {isles.map(([x, y], i) => (
            <g key={`is${i}`}>
              <ellipse cx={x} cy={y} rx="30" ry="6" fill="#160c28" />
              <path d={`M${x - 30},${y} L${x - 8},${y + 18} L${x + 8},${y + 18} L${x + 30},${y} Z`} fill="#0e081c" />
            </g>
          ))}
          {spikes.map(([x, h], i) => (
            <polygon key={i} points={`${x - 7},${gy} ${x - 1},${gy - h} ${x + 2},${gy - h * 0.6} ${x + 8},${gy}`} fill="#0a0614" />
          ))}
          {/* Yeux dans le noir */}
          {eyes.map(([x, y], i) => (
            <g key={`ey${i}`}>
              <ellipse cx={x - 3} cy={y} rx="2" ry="1.3" fill="#c79aff" filter="url(#zs-glow)">
                <animate attributeName="opacity" values="0;0;1;1;0" dur="6s" begin={`${i * 2.5}s`} repeatCount="indefinite" />
              </ellipse>
              <ellipse cx={x + 3} cy={y} rx="2" ry="1.3" fill="#c79aff" filter="url(#zs-glow)">
                <animate attributeName="opacity" values="0;0;1;1;0" dur="6s" begin={`${i * 2.5}s`} repeatCount="indefinite" />
              </ellipse>
            </g>
          ))}
          {/* Runes flottantes */}
          {[220, 470].map((x, i) => (
            <circle key={`r${i}`} cx={x} cy={88} r={10} fill="none" stroke="#8a5ad0" strokeWidth="1.5" opacity="0.5">
              <animate attributeName="opacity" values="0.2;0.6;0.2" dur="3s" repeatCount="indefinite" />
            </circle>
          ))}
        </g>
      );
    }
    case 'celestial': {
      const shards: [number, number, number][] = [[70, 150, 1], [150, 138, 0.8], [590, 150, 1], [648, 140, 0.7], [250, 150, 0.9]];
      const consts: [number, number][] = [[90, 44], [130, 60], [170, 40], [560, 50], [600, 66], [640, 46]];
      return (
        <g>
          {/* Nébuleuse */}
          <ellipse cx="220" cy="86" rx="150" ry="46" fill="#6a3aa0" opacity="0.16" filter="url(#zs-blur)" />
          <ellipse cx="470" cy="78" rx="140" ry="40" fill="#3a5ac0" opacity="0.13" filter="url(#zs-blur)" />
          {/* Constellations */}
          <polyline points="90,44 130,60 170,40" fill="none" stroke="#c0a8ff" strokeWidth="1" opacity="0.45" />
          <polyline points="560,50 600,66 640,46" fill="none" stroke="#c0a8ff" strokeWidth="1" opacity="0.45" />
          {consts.map(([x, y], i) => (
            <circle key={`k${i}`} cx={x} cy={y} r="1.6" fill="#ffe08a">
              <animate attributeName="opacity" values="0.4;1;0.4" dur={`${2 + (i % 3)}s`} repeatCount="indefinite" />
            </circle>
          ))}
          {/* Étoiles filantes */}
          {([[80, 30], [500, 24]] as [number, number][]).map(([x, y], i) => (
            <line key={`sh${i}`} x1={x} y1={y} x2={x + 26} y2={y + 11} stroke="#ffffff" strokeWidth="1.4" opacity="0">
              <animate attributeName="opacity" values="0;0.9;0" dur="3s" begin={`${i * 1.7 + 1}s`} repeatCount="indefinite" />
              <animateTransform attributeName="transform" type="translate" values="0 0; 44 18" dur="3s" begin={`${i * 1.7 + 1}s`} repeatCount="indefinite" additive="sum" />
            </line>
          ))}
          {/* Trône lointain sur un dais */}
          <g transform="translate(340,170)">
            <rect x="-40" y="-6" width="80" height="6" fill="#171232" />
            <rect x="-30" y="-12" width="60" height="6" fill="#1d1740" />
            <rect x="-22" y="-16" width="44" height="4" fill="#241b52" />
            <path d="M-16,-16 L-16,-48 Q0,-64 16,-48 L16,-16 Z" fill="#100c26" stroke="#c0a8ff" strokeWidth="1.2" />
            <polygon points="-16,-48 0,-70 16,-48" fill="#100c26" stroke="#c0a8ff" strokeWidth="1.2" />
            <circle cx="0" cy="-56" r="3" fill="#ffe08a" filter="url(#zs-glow)">
              <animate attributeName="opacity" values="0.6;1;0.6" dur="2.4s" repeatCount="indefinite" />
            </circle>
          </g>
          {/* Éclats de cristal astral (facettés, flottants) */}
          {shards.map(([x, y, s], i) => (
            <g key={i}>
              <animateTransform attributeName="transform" type="translate" values="0 0; 0 -5; 0 0" dur={`${4 + i}s`} repeatCount="indefinite" additive="sum" />
              <polygon points={`${x},${y - 26 * s} ${x + 8 * s},${y - 4 * s} ${x + 5 * s},${y + 10 * s} ${x - 5 * s},${y + 10 * s} ${x - 8 * s},${y - 4 * s}`} fill="#4a3a7a" stroke="#c0a8ff" strokeWidth="0.8" />
              <polygon points={`${x},${y - 26 * s} ${x + 2 * s},${y - 4 * s} ${x},${y + 10 * s} ${x - 2 * s},${y - 4 * s}`} fill="#d8c8ff" opacity="0.8">
                <animate attributeName="opacity" values="0.4;0.95;0.4" dur={`${3 + i}s`} repeatCount="indefinite" />
              </polygon>
            </g>
          ))}
        </g>
      );
    }
    default: {
      // Forêt : pins + lisière lointaine, buissons, champignons luisants.
      const pines: [number, number, string][] = [[44, 1, '#12241a'], [92, 0.8, '#0e1f16'], [150, 0.66, '#0b1a12'], [604, 0.92, '#12241a'], [650, 0.72, '#0e1f16'], [356, 0.6, '#0b1a12']];
      const mush: [number, number][] = [[210, 168], [420, 170], [520, 166]];
      return (
        <g>
          {/* Lisière lointaine */}
          {[20, 55, 90, 125, 540, 575, 610, 645].map((x, i) => (
            <polygon key={`ft${i}`} points={`${x},156 ${x - 9},172 ${x + 9},172`} fill="#12281c" opacity="0.7" />
          ))}
          {pines.map(([x, s, c], i) => (
            <g key={i} transform={`translate(${x},${gy})`}>
              <rect x={-2 * s} y={-10 * s} width={4 * s} height={10 * s} fill="#160f0a" />
              <polygon points={`0,${-34 * s} ${-13 * s},${-14 * s} ${13 * s},${-14 * s}`} fill={c} />
              <polygon points={`0,${-26 * s} ${-11 * s},${-8 * s} ${11 * s},${-8 * s}`} fill={c} />
              <polygon points={`0,${-18 * s} ${-9 * s},${-2 * s} ${9 * s},${-2 * s}`} fill={c} />
            </g>
          ))}
          {/* Buissons au premier plan */}
          {[16, 664].map((x, i) => (
            <g key={`bu${i}`}>
              <circle cx={x} cy={170} r="14" fill="#0f2115" />
              <circle cx={x + (i ? -12 : 12)} cy={172} r="10" fill="#0c1a10" />
            </g>
          ))}
          {/* Champignons luminescents */}
          {mush.map(([x, y], i) => (
            <g key={`m${i}`}>
              <rect x={x - 1} y={y - 6} width="2" height="6" fill="#2a2016" />
              <ellipse cx={x} cy={y - 6} rx="5" ry="3" fill="#7fe3a6" filter="url(#zs-glow)">
                <animate attributeName="opacity" values="0.55;1;0.55" dur={`${3 + i}s`} repeatCount="indefinite" />
              </ellipse>
            </g>
          ))}
        </g>
      );
    }
  }
}

/**
 * Illustration de la zone : décor SUR MESURE par zone (forêt, cavernes, désert…).
 * Quand une escouade y farme (mode boucle), la scène se peuple d'une mêlée animée.
 */
function ZoneScene({
  map,
  farming,
  heroClasses,
  enemyName,
}: {
  map: MapRow;
  farming: boolean;
  heroClasses: string[];
  enemyName: string;
}) {
  const accent = map.accent;
  const t = ZONE_THEMES[map.id] ?? ZONE_THEMES.forest!;
  const classes = (heroClasses.length ? heroClasses : ['guerrier', 'soigneur', 'archer']).slice(0, 5);

  return (
    <div className="panel relative overflow-hidden">
      <svg viewBox="0 0 680 230" className="block h-auto w-full" role="img" aria-label={`Illustration de ${map.name}`}>
        <defs>
          <linearGradient id="zs-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={t.skyTop} />
            <stop offset="100%" stopColor={t.skyBottom} />
          </linearGradient>
          <radialGradient id="zs-hz" cx="0.5" cy="1" r="0.8">
            <stop offset="0%" stopColor={accent} stopOpacity="0.35" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </radialGradient>
          <filter id="zs-blur" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <filter id="zs-glow" x="-70%" y="-70%" width="240%" height="240%">
            <feGaussianBlur stdDeviation="2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect x="0" y="0" width="680" height="230" fill="url(#zs-sky)" />
        <ellipse cx="340" cy="176" rx="380" ry="120" fill="url(#zs-hz)" />

        <ZoneLight kind={t.light} />
        {t.stars &&
          [40, 130, 220, 300, 470, 640, 90].map((sx, i) => (
            <circle key={i} cx={sx} cy={18 + (i % 4) * 8} r={i % 2 ? 1.2 : 0.8} fill="#fff" opacity="0.35" />
          ))}

        {/* Reliefs lointains */}
        <path d="M0,150 Q120,126 250,146 Q380,164 520,138 Q600,124 680,144 L680,230 L0,230 Z" fill={t.hillFar} />
        <path d="M0,168 Q160,148 320,166 Q480,182 680,158 L680,230 L0,230 Z" fill={t.hillMid} />

        {/* Brume qui ondule */}
        {[104, 132, 158].map((my, i) => (
          <ellipse key={i} cx={200 + i * 130} cy={my} rx="190" ry="16" fill={t.mist} opacity="0.08" filter="url(#zs-blur)">
            <animateTransform attributeName="transform" type="translate" values={`${-24 + i * 6} 0; ${24 - i * 6} 0; ${-24 + i * 6} 0`} dur={`${9 + i * 2}s`} repeatCount="indefinite" />
          </ellipse>
        ))}

        {/* Sol */}
        <rect x="0" y="170" width="680" height="60" fill={t.ground} />
        <rect x="0" y="170" width="680" height="2" fill={accent} opacity="0.25" />

        {/* Décor propre à la zone */}
        {renderFore(t.kind)}

        {/* Particules d'ambiance */}
        <Particles color={t.particle} mode={t.pmode} />

        {/* Mêlée animée quand ça farme */}
        {farming && <FarmMelee classes={classes} accent={accent} enemyName={enemyName} />}
      </svg>

      {/* Overlays : nom de zone + état */}
      <span className="absolute left-3 top-3 chip bg-black/40 text-[11px] font-semibold text-[var(--color-ink)]">
        {map.name}
      </span>
      <span
        className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
        style={{
          background: farming ? `${accent}26` : 'rgba(255,255,255,0.06)',
          color: farming ? accent : 'var(--color-muted)',
        }}
      >
        <UiIcon name={farming ? 'attack' : 'loop'} size={12} color="currentColor" />
        {farming ? 'Escouade au combat' : 'Zone au repos — déploie en boucle'}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ZoneListItem({
  map,
  active,
  clearedSet,
  deployed,
  farming,
  onClick,
}: {
  map: MapRow;
  active: boolean;
  clearedSet: Set<string>;
  deployed: boolean;
  /** Une escouade farme cette zone en boucle (visible même zone terminée). */
  farming: boolean;
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
        {farming && (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#5fd39b]/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#5fd39b]"
            title="Tes héros farment cette zone en boucle"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#5fd39b]" />
            Farm
          </span>
        )}
        {zoneDone && <UiIcon name="boss" size={16} title="Zone terminée" />}
        {deployed && !farming && !zoneDone && (
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
  zoneUnlocked,
  depByLevel,
  onPick,
}: {
  map: MapRow;
  clearedSet: Set<string>;
  zoneUnlocked: boolean;
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
          const state = levelState(level, map, clearedSet, zoneUnlocked);
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
                {...(level.level_index === 1 ? { tourTag: 'tour-map-level' } : {})}
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

/** Y a-t-il quelque chose à montrer dans le récap de récolte ? (sinon pas de modal) */
function harvestHasLoot(c: ClaimResponse): boolean {
  const gold = c.totals?.gold ?? 0;
  const resCount = Object.keys(c.totals?.resources ?? {}).length;
  const wins = c.results.reduce((s, r) => s + r.wins, 0);
  return gold > 0 || resCount > 0 || wins > 0;
}

/**
 * Récap de récolte auto : ce qui a été farmé depuis la dernière récupération.
 * Le claim peut être ciblé (un groupe précis) ou global (« Tout récupérer ») → le
 * texte s'adapte au nombre de groupes encaissés (claim.results).
 */
function HarvestSummaryModal({ claim, onClose }: { claim: ClaimResponse; onClose: () => void }) {
  const gold = claim.totals?.gold ?? 0;
  const resources = claim.totals?.resources ?? {};
  const multi = claim.results.length > 1;
  const wins = claim.results.reduce((s, r) => s + r.wins, 0);
  const levels = claim.results.reduce(
    (s, r) => s + r.level_ups.reduce((a, l) => a + l.levels, 0),
    0,
  );
  const resEntries = Object.entries(resources).filter(([, amt]) => amt > 0);
  return (
    <BodyPortal>
      <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
        <div className="panel anim-pop w-full max-w-sm p-5 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-gold)]/15">
            <UiIcon name="loop" size={26} />
          </div>
          <h3 className="heading text-lg">Récolte de la séance</h3>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            {multi
              ? 'Tout ce que tes équipes ont farmé automatiquement depuis la dernière récupération.'
              : 'Tout ce que ce groupe a farmé automatiquement depuis sa dernière récupération.'}
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2 text-xs">
            {wins > 0 && (
              <span className="chip inline-flex items-center gap-1 bg-white/5 text-[var(--color-ink)]">
                <UiIcon name="loop" size={12} /> {compactNumber(wins)} combat{wins > 1 ? 's' : ''} gagné
                {wins > 1 ? 's' : ''}
              </span>
            )}
            {gold > 0 && (
              <span className="chip inline-flex items-center gap-1 bg-[var(--color-gold)]/15 text-[var(--color-gold-soft)]">
                <UiIcon name="gold" size={12} /> +{compactNumber(gold)} or
              </span>
            )}
            {levels > 0 && (
              <span className="chip inline-flex items-center gap-1 bg-emerald-500/15 text-emerald-300">
                <UiIcon name="levelUp" size={12} /> {levels} niveau{levels > 1 ? 'x' : ''}
              </span>
            )}
            {resEntries.map(([res, amt]) => (
              <span
                key={res}
                className="chip inline-flex items-center gap-1 bg-white/5 text-[var(--color-ink)]"
              >
                <ResourceIcon resKey={res} /> +{compactNumber(amt)} {resourceMeta(res).label}
              </span>
            ))}
          </div>
          {resEntries.length === 0 && (
            <p className="mt-3 text-xs text-[var(--color-muted)]">
              Aucun matériau ramassé cette fois — que de l'or et de l'XP.
            </p>
          )}
          <button onClick={onClose} className="btn btn-primary mt-4 w-full text-sm">
            Continuer
          </button>
        </div>
      </div>
    </BodyPortal>
  );
}

function LevelNode({
  level,
  state,
  accent,
  deployedMode,
  onClick,
  tourTag,
}: {
  level: LevelRow;
  state: LevelState;
  accent: string;
  deployedMode: 'advance' | 'loop' | null;
  onClick: () => void;
  /** Clé data-tour posée sur ce niveau (tutoriel), si applicable. */
  tourTag?: string;
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
      data-tour={tourTag}
      title={`${level.name} · Difficulté ${level.difficulty} · Puissance ${level.power} (${level.enemyCount} ennemi(s) · ${level.enemyHp} PV · ${level.enemyAtk} ATK)${
        level.isBoss ? ' · Boss' : ''
      }${deployed ? ' · groupe déployé' : ''}`}
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
      <span className="mt-0.5 inline-flex items-center gap-0.5 text-[8px] leading-none text-[var(--color-ember)]">
        <UiIcon name="attack" size={8} color="currentColor" />
        {compactNumber(level.power)}
      </span>
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
  cooldownLeft,
  maps,
  heroById,
  borrowExhausted,
  onToggleMode,
  onFight,
  fighting,
  onReplay,
  onRemove,
  onRecover,
  onRetreat,
  busy,
}: {
  dep: DeploymentRow;
  now: number;
  /** Secondes restantes avant le prochain assaut — échéance LOCALE (voir cooldownUntil). */
  cooldownLeft: number;
  maps: MapRow[];
  heroById: (id: string) => HeroView | undefined;
  borrowExhausted: string | null;
  onToggleMode: () => void;
  onFight: () => void;
  fighting: boolean;
  onReplay: () => void;
  /** Retire le groupe sans rien encaisser (mode assauts manuels : aucun gain idle). */
  onRemove: () => void;
  /** Encaisse les gains accumulés SANS retirer le groupe — la team continue de farmer. */
  onRecover: () => void;
  /** « Replis » : encaisse les gains PUIS retire le groupe (mode farm auto). */
  onRetreat: () => void;
  busy: boolean;
}) {
  const level = maps.flatMap((m) => m.levels).find((l) => l.id === dep.level_id);
  const map = maps.find((m) => m.id === level?.map_id);

  // Estimation idle (mode boucle) : nombre de combats accumulés depuis la
  // dernière récolte. Purement indicatif — le vrai décompte est recalculé côté
  // serveur au claim. Le cooldown d'assaut manuel, lui, n'utilise PLUS cette
  // comparaison : il vient de `cooldownLeft` (échéance locale, cf. cooldownUntil).
  const elapsed = Math.max(0, (now - Date.parse(dep.last_resolved_at)) / 1000);
  const pending = fightsForElapsed(elapsed);
  const manual = dep.mode === 'advance';
  // Y a-t-il quelque chose à encaisser ? En assauts manuels : JAMAIS — chaque combat
  // est crédité aussitôt, et `last_resolved_at` n'y sert que d'ancre de cooldown
  // (l'utiliser comme un stock de combats en attente serait un contresens).
  const hasPending = !manual && pending > 0;

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
                      // Infobulle = nom du HÉROS (pas la classe), qui l'emporte sur le title par défaut de ClassIcon.
                      <ClassIcon classId={h.classId} size={18} title={h.name} />
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
                data-tour="tour-fight"
                onClick={onFight}
                disabled={fighting || cooldownLeft > 0}
                className="btn btn-primary px-3 py-1.5 text-xs"
                title="Lancer un assaut sur ce niveau"
              >
                <UiIcon name="attack" size={13} color="currentColor" />
                {fighting ? 'Combat…' : cooldownLeft > 0 ? `${cooldownLeft}s` : 'Attaquer'}
              </button>
            )}
            {/* Toggle « Farm auto » : ON = boucle (farm auto), OFF = avancer (assauts manuels). */}
            <button
              data-tour="deploy-mode"
              onClick={onToggleMode}
              disabled={busy}
              role="switch"
              aria-checked={!manual}
              title="Farm auto : ON = l'équipe farme en boucle · OFF = tu lances les assauts (Avancer). Les gains en attente sont encaissés avant de changer de mode."
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-edge)] px-2 py-1 text-[11px] font-medium text-[var(--color-muted)] transition hover:border-white/25 disabled:opacity-50"
            >
              <UiIcon name="loop" size={12} color={manual ? 'currentColor' : 'var(--color-gold-soft)'} />
              <span className={manual ? '' : 'text-[var(--color-gold-soft)]'}>Farm auto</span>
              <span
                className={`relative h-4 w-7 shrink-0 rounded-full transition ${
                  manual ? 'bg-white/15' : 'bg-[var(--color-gold)]'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${
                    manual ? 'left-0.5' : 'left-3.5'
                  }`}
                />
              </span>
            </button>
            {dep.last_combat != null && (
              <button onClick={onReplay} className="btn btn-ghost px-3 py-1.5 text-xs">
                ▶ Replay
              </button>
            )}
            {/* Barre d'actions STABLE : les deux mêmes boutons dans les deux modes.
                Basculer le toggle ne doit pas réarranger la rangée (avant, « Replis »
                se muait en croix et « Récupérer » disparaissait — le layout sautait).
                · « Récupérer » encaisse SANS retirer (la team continue de farmer) ;
                  grisé quand il n'y a rien à encaisser — toujours le cas en assauts
                  manuels, où chaque combat est crédité aussitôt.
                · « Replis » retire le groupe (en farm auto, il encaisse d'abord). */}
            <button
              onClick={onRecover}
              disabled={busy || !hasPending}
              className="btn btn-primary px-3 py-1.5 text-xs"
              title={
                manual
                  ? 'Rien à encaisser : en assauts manuels, chaque combat est crédité aussitôt'
                  : hasPending
                    ? 'Encaisse les récompenses accumulées ; la team continue de farmer'
                    : 'Rien à encaisser pour le moment'
              }
            >
              <UiIcon name="gold" size={13} color="currentColor" />
              {busy ? 'Récupération…' : 'Récupérer'}
            </button>
            <button
              onClick={manual ? onRemove : onRetreat}
              disabled={busy}
              className="btn btn-ghost px-3 py-1.5 text-xs"
              title={
                manual
                  ? 'Retirer le groupe'
                  : 'Encaisse les récompenses accumulées puis retire le groupe'
              }
            >
              <UiIcon name="leave" size={13} color="currentColor" /> Replis
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
            <span
              className="chip inline-flex items-center gap-1 bg-white/5 text-[var(--color-muted)]"
              title="Combats accumulés en attente. « Récupérer » les encaisse (la team continue), « Replis » les encaisse et retire le groupe. Le serveur accumule jusqu'à 12 h — au-delà, le surplus est perdu."
            >
              <UiIcon name="loop" size={11} color="currentColor" /> ≈ {pending} combat(s) en attente
            </span>
          )}
          {/* On affiche le NOMBRE DE COMBATS de la récolte en même temps que son
              résultat : sans lui, « 1V · 0D » paraissait contredire le cumul
              « X victoires ici » alors que les deux comptent des choses
              différentes (une récolte ≠ tout le temps passé sur le niveau). */}
          {dep.last_fights > 0 && (
            <span
              className="chip bg-white/5 text-[var(--color-muted)]"
              title="Résultat de la DERNIÈRE récolte automatique uniquement (elle passe toutes les 45 s et ne traite qu'un ou deux combats), et non de tout ton farm."
            >
              Dernière récolte : {dep.last_fights} combat{dep.last_fights > 1 ? 's' : ''} —{' '}
              <span className="text-emerald-300">{dep.last_wins}V</span> ·{' '}
              <span className="text-[var(--color-ember)]">{dep.last_losses}D</span>
            </span>
          )}
          {dep.mode === 'loop' && dep.clears_count > 0 && (
            <span
              className="chip inline-flex items-center gap-1 bg-[var(--color-gold)]/15 text-[var(--color-gold-soft)]"
              title="Victoires cumulées sur ce niveau depuis que ton escouade y est. Remis à zéro si une défaite la fait reculer d'un niveau."
            >
              <UiIcon name="loop" size={11} color="currentColor" /> {dep.clears_count} victoire
              {dep.clears_count > 1 ? 's' : ''} ici
            </span>
          )}
          {dep.blocked && (
            <span className="chip inline-flex items-center gap-1 bg-[var(--color-ember)]/20 text-[var(--color-ember)]">
              <UiIcon name="warning" size={11} color="currentColor" /> Bloquée — renforce l'équipe
            </span>
          )}
          {borrowExhausted && (
            <span
              className="chip inline-flex items-center gap-1 bg-[var(--color-ember)]/20 text-[var(--color-ember)]"
              title={`${borrowExhausted} a épuisé ses ${BORROW_MAP_FIGHTS_PER_DAY} combats de carte du jour — retire-le pour que le groupe farme.`}
            >
              <UiIcon name="warning" size={11} color="currentColor" /> Renfort épuisé — retire {borrowExhausted}
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
  borrowable,
  availability,
  onClose,
  onDeploy,
  pending,
  error,
}: {
  level: LevelRow;
  heroes: HeroView[];
  borrowable: GarrisonHero[];
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

  // Tutoriel : signale dès qu'un héros est composé (fait avancer l'étape « héros »).
  const setTourDeployHeroChosen = useTourSignals((s) => s.setDeployHeroChosen);
  useEffect(() => {
    setTourDeployHeroChosen(team.length > 0);
  }, [team.length, setTourDeployHeroChosen]);

  // Compositions enregistrées (max 3) : appliquer / enregistrer la compo courante.
  const { data: presets } = useTeamPresets();
  const presetActions = useTeamPresetActions();
  const presetList = presets ?? [];
  const [presetName, setPresetName] = useState('');

  /** Charge une compo : place les héros encore possédés et disponibles. */
  function applyPreset(preset: TeamPreset) {
    const next: (string | null)[] = [null, null, null, null, null];
    let i = 0;
    for (const id of preset.hero_ids) {
      if (i >= 5) break;
      const h = heroes.find((x) => x.id === id);
      if (!h || isBusy(id)) continue; // héros renvoyé/occupé → ignoré
      next[i] = id;
      i += 1;
    }
    setSlots(next);
  }

  function saveCurrentPreset() {
    const name = presetName.trim();
    if (!name || team.length === 0 || presetList.length >= MAX_TEAM_PRESETS) return;
    presetActions.save.mutate(
      { name, heroIds: team },
      { onSuccess: () => setPresetName('') },
    );
  }
  // Renforts de garnison (héros empruntés à la guilde) — au plus 1 par équipe.
  const borrowMap = new Map(borrowable.map((b) => [b.hero_id, b]));
  const isBorrowed = (id: string) => borrowMap.has(id);
  const borrowedInSlots = team.filter((id) => isBorrowed(id)).length;
  const { data: borrowUsage } = useBorrowUsage();
  /** Infos d'affichage unifiées (héros possédé OU emprunté). */
  const heroInfo = (id: string) => {
    const own = heroes.find((x) => x.id === id);
    if (own) return { name: own.name, classId: own.classId, level: own.level, borrowed: false };
    const b = borrowMap.get(id);
    if (b) return { name: b.name, classId: b.class_id, level: b.level, borrowed: true };
    return null;
  };
  // Pool = tous les héros non placés ; les occupés (farm/expédition) sont affichés
  // mais non sélectionnables, pour qu'on voie la dispo AVANT de composer.
  const notInSlots = heroes.filter((h) => !slots.includes(h.id));
  const pool = notInSlots.filter((h) => !isBusy(h.id));
  const busyPool = notInSlots.filter((h) => isBusy(h.id));
  const borrowPool = borrowable.filter((b) => !slots.includes(b.hero_id));
  const gem = gemByMap(level.map_id);

  function placeHero(id: string, slotIndex: number) {
    if (isBusy(id)) return;
    // Un seul renfort emprunté par équipe.
    if (isBorrowed(id) && !slots.includes(id) && borrowedInSlots >= BORROW_LIMIT_PER_TEAM) return;
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
    if (isBorrowed(id) && borrowedInSlots >= BORROW_LIMIT_PER_TEAM) return;
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
    <BodyPortal>
    <div className="anim-fade fixed inset-0 z-50 flex items-stretch justify-center bg-black/70 p-0 sm:items-center sm:p-4">
      {/* Structure en-tête / corps scrollable / PIED FIXE : le bouton « Déployer »
          était le dernier élément d'un long formulaire scrollable — sur mobile il
          fallait scroller tout le contenu pour l'atteindre (voire impossible avec
          le clavier ouvert). Il reste désormais visible en permanence. */}
      <div className="panel anim-pop flex h-full max-h-[100dvh] w-full max-w-md flex-col rounded-none sm:h-auto sm:max-h-[90vh] sm:rounded-[var(--radius-xl2)]">
        <div className="flex shrink-0 items-center justify-between px-4 pb-1 pt-4 sm:px-5 sm:pt-5">
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
        {/* Corps scrollable — tout sauf l'en-tête et le pied « Déployer ». */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-5">
        <p className="mb-3 text-xs text-[var(--color-muted)]">
          Difficulté {level.difficulty} · {level.enemyCount} ennemi(s)
          {level.isBoss ? ' · Boss' : ''}
        </p>

        {/* Puissance ennemie : ordre d'idée avant de composer l'équipe. */}
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="chip inline-flex items-center gap-1 bg-[var(--color-ember)]/15 text-[var(--color-ember)]">
            <UiIcon name="attack" size={12} color="currentColor" /> Puissance {level.power}
          </span>
          <span className="chip inline-flex items-center gap-1 bg-white/5 text-[var(--color-muted)]">
            ❤ {level.enemyHp} PV
          </span>
          <span className="chip inline-flex items-center gap-1 bg-white/5 text-[var(--color-muted)]">
            ⚔ {level.enemyAtk} ATK
          </span>
        </div>

        {/* Compositions enregistrées : appliquer en un clic ou sauver la compo courante */}
        <div className="mb-4 rounded-lg border border-[var(--color-edge)] bg-black/20 p-3">
          <div className="mb-2 flex items-center justify-between text-xs font-medium text-[var(--color-muted)]">
            <span>Compositions enregistrées</span>
            <span className="tabular-nums">
              {presetList.length}/{MAX_TEAM_PRESETS}
            </span>
          </div>
          {presetList.length === 0 ? (
            <p className="text-[11px] text-[var(--color-muted)]/70">
              Aucune compo. Compose une équipe puis enregistre-la ci-dessous.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {presetList.map((p) => (
                <div key={p.id} className="flex items-center gap-2">
                  <button
                    onClick={() => applyPreset(p)}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--color-edge)] bg-black/20 px-2.5 py-1.5 text-left text-sm transition hover:border-[var(--color-arcane)]"
                    title="Appliquer cette composition"
                  >
                    <UiIcon name="attack" size={12} color="var(--color-arcane)" />
                    <span className="truncate text-[var(--color-ink)]">{p.name}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-[var(--color-muted)]">
                      {p.hero_ids.length} héros
                    </span>
                  </button>
                  <button
                    onClick={() => presetActions.remove.mutate(p.id)}
                    title="Supprimer la composition"
                    className="shrink-0 px-1 text-[var(--color-muted)] transition hover:text-[var(--color-ember)]"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          {presetList.length < MAX_TEAM_PRESETS ? (
            <div className="mt-2 flex gap-2">
              <input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Nom de la compo"
                maxLength={24}
                className="min-w-0 flex-1 rounded-lg border border-[var(--color-edge)] bg-black/30 px-2.5 py-1.5 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-arcane)]"
              />
              <button
                onClick={saveCurrentPreset}
                disabled={!presetName.trim() || team.length === 0 || presetActions.save.isPending}
                className="btn btn-ghost shrink-0 px-3 py-1.5 text-xs"
                title={team.length === 0 ? 'Compose d’abord une équipe' : 'Enregistrer la compo courante'}
              >
                Enregistrer
              </button>
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-[var(--color-muted)]/70">
              Limite de {MAX_TEAM_PRESETS} compos atteinte — supprimes-en une pour enregistrer.
            </p>
          )}
          {presetActions.save.isError && (
            <p className="mt-1 text-[11px] text-[var(--color-ember)]">
              {presetActions.save.error instanceof Error
                ? presetActions.save.error.message
                : 'Erreur'}
            </p>
          )}
        </div>

        {/* Composition : glisse tes héros dans les emplacements (clic = ajout/retrait) */}
        <div className="mb-4">
          <div className="mb-2 text-sm font-medium text-[var(--color-muted)]">
            Composition · {team.length}/5
          </div>
          <div className="mb-3 grid grid-cols-5 gap-2">
            {slots.map((slotId, i) => {
              const h = slotId ? heroInfo(slotId) : null;
              return (
                <div
                  key={i}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => onDropInSlot(e, i)}
                  className={`relative flex aspect-square flex-col items-center justify-center rounded-xl border text-center transition ${
                    h
                      ? 'border-[var(--color-arcane)] bg-[var(--color-arcane)]/15'
                      : 'border-dashed border-[var(--color-edge)] bg-black/20'
                  }`}
                >
                  {h && slotId ? (
                    <button
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('text/hero', slotId)}
                      onClick={() => removeHero(slotId)}
                      title={`${h.name}${h.borrowed ? ' (renfort)' : ''} — clic pour retirer`}
                      className="flex h-full w-full cursor-grab flex-col items-center justify-center active:cursor-grabbing"
                    >
                      {h.borrowed && (
                        <span className="absolute right-0.5 top-0.5 rounded bg-[var(--color-arcane)]/30 px-1 text-[7px] font-semibold uppercase tracking-wide text-[var(--color-arcane)]">
                          renfort
                        </span>
                      )}
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
            data-tour="tour-deploy-hero"
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

        {borrowPool.length > 0 && (
          <div className="mb-4">
            <div className="mb-1 text-xs font-semibold text-[var(--color-arcane)]">
              Renforts de guilde{' '}
              <span className="font-normal text-[var(--color-muted)]">
                — {BORROW_LIMIT_PER_TEAM} max par équipe
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {borrowPool.map((b) => {
                const left = mapFightsLeft(borrowUsage, b.hero_id);
                const exhausted = left <= 0;
                const full = borrowedInSlots >= BORROW_LIMIT_PER_TEAM || exhausted;
                return (
                  <button
                    key={b.hero_id}
                    draggable={!full}
                    onDragStart={(e) => e.dataTransfer.setData('text/hero', b.hero_id)}
                    onClick={() => !exhausted && addToFirstFree(b.hero_id)}
                    disabled={full}
                    title={
                      exhausted
                        ? `${b.name} — renfort épuisé sur la carte aujourd'hui (${BORROW_MAP_FIGHTS_PER_DAY} combats/jour)`
                        : `${b.name} — renfort de ${b.owner_name} · ${left}/${BORROW_MAP_FIGHTS_PER_DAY} combats carte restants aujourd'hui`
                    }
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition ${
                      full
                        ? 'cursor-not-allowed opacity-40'
                        : 'cursor-grab hover:border-white/25 active:cursor-grabbing'
                    }`}
                    style={{ borderColor: 'rgba(124,108,255,0.35)' }}
                  >
                    <ClassIcon classId={b.class_id} size={18} />
                    <span className="text-[var(--color-ink)]">{b.name}</span>
                    <span className="text-[10px] text-[var(--color-muted)]">N.{b.level}</span>
                    <span
                      className={`rounded px-1 text-[9px] font-semibold ${
                        exhausted
                          ? 'bg-[var(--color-ember)]/20 text-[var(--color-ember)]'
                          : 'bg-[var(--color-arcane)]/20 text-[var(--color-arcane)]'
                      }`}
                    >
                      {exhausted ? 'épuisé' : `${left}/${BORROW_MAP_FIGHTS_PER_DAY}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

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

        {/* Butin : matériau de zone (niv. 1-4) OU composant + gemme (boss niv. 5) */}
        <div className="mb-4 rounded-lg border border-[var(--color-edge)] bg-black/20 p-3">
          {!level.isBoss ? (
            <div className="flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1 text-[var(--color-ink)]">
                <ResourceIcon resKey={level.resource} /> Matériau {resourceMeta(level.resource).label}
              </span>
              <span className="text-[var(--color-muted)]">
                {pct(materialDropChance(level.difficulty))} / combat gagné
              </span>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1 text-[var(--color-ink)]">
                  <ResourceIcon resKey={level.bossResource} size={16} /> Composant{' '}
                  {resourceMeta(level.bossResource).label}
                </span>
                <span className="text-[var(--color-muted)]">
                  {pct(BOSS_MATERIAL_CHANCE)} / boss vaincu
                </span>
              </div>
              {gem && (
                <div className="mt-2 flex items-center justify-between border-t border-[var(--color-edge)] pt-2 text-xs">
                  <span className="inline-flex items-center gap-1 text-[var(--color-ink)]">
                    <ResourceIcon resKey={gem.id} size={16} /> {gem.label}{' '}
                    <span className="inline-flex items-center gap-1 text-[var(--color-arcane)]">
                      (<PassiveIcon passive={gem.passive} size={12} /> {gem.passiveLabel})
                    </span>
                  </span>
                  <span className="text-[var(--color-muted)]">{pct(GEM_DROP_CHANCE)} / boss vaincu</span>
                </div>
              )}
            </>
          )}
          <p className="mt-2 text-[10px] text-[var(--color-muted)]/70">
            {level.isBoss
              ? `Le boss ne lâche que son butin rare : composant${gem ? ' et gemme de joaillerie' : ''}, à faible taux. Le matériau de zone se farme aux niveaux 1-4.`
              : "L'équipement ne droppe pas en zone : forge-le avec ces matériaux."}
          </p>
        </div>

        </div>

        {/* Pied fixe : toujours accessible, même formulaire long ou clavier ouvert. */}
        <div className="shrink-0 border-t border-[var(--color-edge)] px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:pb-4">
          {error && <p className="mb-2 text-sm text-[var(--color-ember)]">{error}</p>}
          <button
            data-tour="tour-deploy-confirm"
            onClick={() => team.length > 0 && onDeploy(team, mode)}
            disabled={team.length === 0 || pending}
            className="btn btn-primary w-full"
          >
            {pending ? 'Déploiement…' : 'Déployer'}
          </button>
        </div>
      </div>
    </div>
    </BodyPortal>
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
