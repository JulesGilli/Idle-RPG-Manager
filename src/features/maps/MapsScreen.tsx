import { useEffect, useRef, useState } from 'react';
import { useHeroes, type HeroView } from '@/features/heroes/useHeroes';
import { classMeta } from '@/lib/gameUi';
import { CombatReplay, type StoredCombat } from '@/components/CombatReplay';
import { RESOURCE_META, resourceMeta } from '@/hooks/useResources';
import { fightsForElapsed } from '@shared/progression/deployment';
import { lootOdds, materialDropChance } from '@shared/progression/loot';
import {
  useMaps,
  useLevelProgress,
  useDeployments,
  type LevelRow,
  type MapRow,
  type DeploymentRow,
} from './useMaps';
import { useDeploymentActions, type ClaimResponse } from './useDeploymentActions';

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
  const [claimSummary, setClaimSummary] = useState<ClaimResponse | null>(null);

  const clearedSet = cleared ?? new Set<string>();
  const heroList = heroes ?? [];
  const deps = deployments ?? [];

  // Horloge live (1 s) pour estimer les combats en attente.
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

  // Récolte : manuelle (avec résumé) ou automatique (silencieuse), sans chevauchement.
  const claimingRef = useRef(false);
  const doClaim = (showSummary: boolean) => {
    if (claimingRef.current) return;
    claimingRef.current = true;
    actions.claim.mutate(undefined, {
      onSuccess: (data) => {
        if (showSummary) setClaimSummary(data);
      },
      onSettled: () => {
        claimingRef.current = false;
      },
    });
  };
  const doClaimRef = useRef(doClaim);
  doClaimRef.current = doClaim;

  // Auto-récolte périodique (les ressources tombent sans bouton).
  useEffect(() => {
    if (deps.length === 0) return;
    const run = () => doClaimRef.current(false);
    run();
    const id = setInterval(run, 45_000);
    return () => clearInterval(id);
  }, [deps.length]);

  return (
    <section className="anim-fade space-y-6">
      <div>
        <h2 className="heading text-2xl">Carte du monde</h2>
        <p className="text-sm text-[var(--color-muted)]">
          Déploie tes héros sur les niveaux. Ils combattent en continu — reviens réclamer.
        </p>
      </div>

      {/* Barre de récolte */}
      <div className="panel flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="text-sm text-[var(--color-muted)]">
          {deps.length > 0 ? (
            <>
              {deps.length} groupe(s) en expédition.{' '}
              <span className="text-[var(--color-muted)]/70">Récolte auto toutes les 45 s.</span>
            </>
          ) : (
            'Aucun groupe déployé. Choisis un niveau ci-dessous.'
          )}
        </div>
        <button
          onClick={() => doClaim(true)}
          disabled={deps.length === 0 || actions.claim.isPending}
          className="btn btn-arcane"
        >
          {actions.claim.isPending ? 'Récolte…' : '✋ Récolter maintenant'}
        </button>
      </div>

      {claimSummary && (
        <ClaimSummary summary={claimSummary} onClose={() => setClaimSummary(null)} />
      )}

      {/* Déploiements actifs */}
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
              onReplay={() => {
                if (dep.last_combat) setReplay(dep.last_combat as StoredCombat);
              }}
              onRemove={() => actions.undeploy.mutate(dep.id)}
              busy={actions.setMode.isPending || actions.undeploy.isPending}
            />
          ))}
        </div>
      )}

      {/* Maps */}
      {mapsLoading && <p className="text-[var(--color-muted)]">Chargement de la carte…</p>}
      <div className="space-y-5">
        {(maps ?? []).map((map) => (
          <div key={map.id} className="panel p-4">
            <div className="mb-3 flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-full"
                style={{ background: map.accent, boxShadow: `0 0 10px ${map.accent}` }}
              />
              <h3 className="font-display font-semibold text-[var(--color-ink)]">{map.name}</h3>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {map.levels.map((level) => {
                const state = levelState(level, map, clearedSet);
                return (
                  <LevelNode
                    key={level.id}
                    level={level}
                    state={state}
                    accent={map.accent}
                    deployedMode={depByLevel.get(level.id) ?? null}
                    onClick={() => state !== 'locked' && setDeployTarget({ level, map })}
                  />
                );
              })}
            </div>
          </div>
        ))}
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
    </section>
  );
}

/* -------------------------------------------------------------------------- */

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
  const deployed = deployedMode !== null;
  return (
    <button
      onClick={onClick}
      disabled={locked}
      className={`panel-hover relative flex aspect-square flex-col items-center justify-center rounded-xl border p-1 text-center transition ${
        locked
          ? 'cursor-not-allowed border-[var(--color-edge)] bg-black/20 opacity-50'
          : 'border-[var(--color-edge)] bg-white/[0.03]'
      } ${deployed ? 'ring-2 ring-[var(--color-arcane)]' : ''}`}
      style={state === 'cleared' && !deployed ? { borderColor: accent } : undefined}
      title={deployed ? `${level.name} — groupe déployé` : level.name}
    >
      {state === 'cleared' && !deployed && (
        <span className="absolute right-1 top-1 text-[10px]" style={{ color: accent }}>
          ✓
        </span>
      )}
      {locked && <span className="absolute right-1 top-1 text-[10px]">🔒</span>}
      {deployed && (
        <span className="absolute left-1 top-1 text-[11px]" title="Groupe déployé">
          {deployedMode === 'advance' ? '➡️' : '🔁'}
        </span>
      )}
      {level.isBoss && (
        <span className="absolute bottom-1 right-1 text-[10px]" title="Boss">
          👑
        </span>
      )}
      <span className="font-display text-lg font-bold text-[var(--color-ink)]">
        {level.level_index}
      </span>
      <span className="text-[9px] text-[var(--color-muted)]">Diff. {level.difficulty}</span>
    </button>
  );
}

function DeploymentCard({
  dep,
  now,
  maps,
  heroById,
  onToggleMode,
  onReplay,
  onRemove,
  busy,
}: {
  dep: DeploymentRow;
  now: number;
  maps: MapRow[];
  heroById: (id: string) => HeroView | undefined;
  onToggleMode: () => void;
  onReplay: () => void;
  onRemove: () => void;
  busy: boolean;
}) {
  const level = maps.flatMap((m) => m.levels).find((l) => l.id === dep.level_id);
  const map = maps.find((m) => m.id === level?.map_id);

  const pending = fightsForElapsed((now - Date.parse(dep.last_resolved_at)) / 1000);

  return (
    <div
      className={`panel anim-slide p-4 ${dep.blocked ? 'ring-1 ring-[var(--color-ember)]/60' : ''}`}
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
          <button
            onClick={onToggleMode}
            disabled={busy}
            className={`chip ${
              dep.mode === 'advance'
                ? 'bg-[var(--color-arcane)]/20 text-[var(--color-ink)]'
                : 'bg-[var(--color-gold)]/15 text-[var(--color-gold-soft)]'
            }`}
            title="Basculer avancer / farmer en boucle"
          >
            {dep.mode === 'advance' ? '➡ Avancer' : '🔁 Boucle'}
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

      {/* Statut / infos de farm */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="chip bg-white/5 text-[var(--color-muted)]">
          ⏳ ≈ {pending} combat(s) en attente
        </span>
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
  );
}

const RARITY_ABBR: Record<string, string> = {
  poor: 'Md',
  common: 'C',
  uncommon: 'PC',
  advanced: 'Av',
  ultimate: 'U',
};

const DROP_TYPE_META: Record<string, { icon: string; label: string }> = {
  weapon: { icon: '🗡️', label: 'Arme' },
  armor: { icon: '🛡️', label: 'Armure' },
  jewel: { icon: '💍', label: 'Bijou' },
  relic: { icon: '🔮', label: 'Relique' },
};

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
  const [team, setTeam] = useState<string[]>([]);
  const [mode, setMode] = useState<'advance' | 'loop'>('advance');

  function toggle(id: string) {
    setTeam((prev) =>
      prev.includes(id) ? prev.filter((h) => h !== id) : prev.length >= 5 ? prev : [...prev, id],
    );
  }

  const odds = lootOdds(level.difficulty, level.maxRarity);
  const dropByType = (['weapon', 'armor', 'jewel', 'relic'] as const).map((t) => {
    const rows = odds.filter((o) => o.item_type === t);
    return { type: t, total: rows.reduce((s, o) => s + o.chance, 0), rows };
  });
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

  return (
    <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="panel anim-pop max-h-[90vh] w-full max-w-md overflow-y-auto p-5">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-[var(--color-ink)]">
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
        </p>

        <div className="mb-4">
          <div className="mb-2 text-sm font-medium text-[var(--color-muted)]">
            Héros disponibles · {team.length}/5
          </div>
          {heroes.length === 0 ? (
            <p className="text-xs text-[var(--color-muted)]">
              Tous tes héros sont déjà déployés. Retire un groupe pour en libérer.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {heroes.map((h) => {
                const active = team.includes(h.id);
                return (
                  <button
                    key={h.id}
                    onClick={() => toggle(h.id)}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition ${
                      active
                        ? 'border-[var(--color-arcane)] bg-[var(--color-arcane)]/15 text-white'
                        : 'border-[var(--color-edge)] bg-black/20 text-[var(--color-muted)] hover:border-white/25'
                    }`}
                  >
                    <span>{classMeta(h.classId).icon}</span>
                    {h.name}
                    <span className="text-[10px] text-[var(--color-muted)]">N.{h.level}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="mb-4 flex gap-2">
          <ModeButton
            active={mode === 'advance'}
            onClick={() => setMode('advance')}
            label="➡ Avancer"
          />
          <ModeButton
            active={mode === 'loop'}
            onClick={() => setMode('loop')}
            label="🔁 Farmer en boucle"
          />
        </div>

        {/* Butin possible */}
        <div className="mb-4 rounded-lg border border-[var(--color-edge)] bg-black/20 p-3">
          <div className="mb-2 text-xs font-medium text-[var(--color-muted)]">
            Butin possible (par combat gagné)
          </div>
          <div className="space-y-1">
            {dropByType.map((d) => (
              <div key={d.type} className="flex items-center justify-between text-xs">
                <span className="text-[var(--color-ink)]">
                  {DROP_TYPE_META[d.type]!.icon} {DROP_TYPE_META[d.type]!.label}
                </span>
                <span className="text-[var(--color-muted)]">
                  {pct(d.total)}{' '}
                  <span className="text-[10px]">
                    ({d.rows.map((r) => `${RARITY_ABBR[r.rarity]} ${pct(r.chance)}`).join(' · ')})
                  </span>
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-[var(--color-edge)] pt-2 text-xs">
            <span className="text-[var(--color-ink)]">
              {resourceMeta(level.resource).icon} Matériau {resourceMeta(level.resource).label}
            </span>
            <span className="text-[var(--color-muted)]">
              {pct(materialDropChance(level.difficulty))} / combat
            </span>
          </div>
          <p className="mt-2 text-[10px] text-[var(--color-muted)]/70">
            Raretés plafonnées par zone ; stats et taux montent avec la difficulté.
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

function ClaimSummary({ summary, onClose }: { summary: ClaimResponse; onClose: () => void }) {
  const totalWins = summary.results.reduce((s, r) => s + r.wins, 0);
  const totalItems = summary.results.reduce((s, r) => s + r.items.length, 0);
  const totalLevelUps = summary.results.reduce(
    (s, r) => s + r.level_ups.reduce((a, l) => a + l.levels, 0),
    0,
  );

  return (
    <div className="panel anim-pop border-[var(--color-arcane)]/40 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-display font-semibold text-[var(--color-gold-soft)]">Récolte</h3>
        <button
          onClick={onClose}
          className="text-[var(--color-muted)] hover:text-[var(--color-ink)]"
        >
          ✕
        </button>
      </div>
      {summary.totals ? (
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="chip bg-[var(--color-gold)]/15 text-[var(--color-gold-soft)]">
            💰 +{summary.totals.gold} or
          </span>
          <span className="chip bg-emerald-500/15 text-emerald-300">⚔️ {totalWins} victoires</span>
          {totalLevelUps > 0 && (
            <span className="chip bg-[var(--color-arcane)]/20 text-[var(--color-ink)]">
              ⬆ {totalLevelUps} niveau(x)
            </span>
          )}
          {totalItems > 0 && (
            <span className="chip bg-fuchsia-500/15 text-fuchsia-300">
              🎁 {totalItems} objet(s)
            </span>
          )}
          {Object.entries(summary.totals.resources).map(([res, amt]) =>
            amt > 0 ? (
              <span key={res} className="chip bg-white/5 text-[var(--color-ink)]">
                {RESOURCE_META[res]?.icon ?? '📦'} +{amt} {RESOURCE_META[res]?.label ?? res}
              </span>
            ) : null,
          )}
        </div>
      ) : (
        <p className="text-sm text-[var(--color-muted)]">Rien de neuf pour l'instant.</p>
      )}
    </div>
  );
}
