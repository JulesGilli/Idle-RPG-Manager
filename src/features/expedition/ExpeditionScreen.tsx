import { useEffect, useMemo, useState } from 'react';
import { useHeroes, type HeroView } from '@/features/heroes/useHeroes';
import { useDeployments } from '@/features/maps/useMaps';
import { resourceMeta } from '@/hooks/useResources';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { UiIcon, ClassIcon } from '@/components/synty/GameIcons';
import { computeExpeditionDuration } from '@shared/progression/expedition';
import {
  useExpeditionTypes,
  useActiveExpeditions,
  useExpeditionActions,
  type ExpeditionTypeRow,
  type ExpeditionRunRow,
  type ExpeditionRewards,
} from './useExpedition';

const MAX_TEAM = 4;

function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}

export function ExpeditionScreen() {
  const { data: types, isLoading } = useExpeditionTypes();
  const { data: runs } = useActiveExpeditions();
  const { data: heroes } = useHeroes();
  const { data: deployments } = useDeployments();
  const actions = useExpeditionActions();

  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rewards, setRewards] = useState<ExpeditionRewards | null>(null);

  const heroList = heroes ?? [];
  const activeRuns = runs ?? [];

  // Héros engagés (déploiements + expéditions en cours) → indisponibles.
  const engaged = useMemo(() => {
    const set = new Set<string>();
    for (const d of deployments ?? []) for (const h of d.hero_ids) set.add(h);
    for (const r of activeRuns) for (const h of r.hero_ids) set.add(h);
    return set;
  }, [deployments, activeRuns]);

  const available = heroList.filter((h) => !engaged.has(h.id));
  const type = (types ?? []).find((t) => t.id === selectedType) ?? null;

  function toggleHero(id: string) {
    setPicked((cur) =>
      cur.includes(id) ? cur.filter((h) => h !== id) : cur.length < MAX_TEAM ? [...cur, id] : cur,
    );
  }

  function launch() {
    if (!type || picked.length === 0) return;
    setError(null);
    actions.start.mutate(
      { expeditionTypeId: type.id, heroIds: picked },
      {
        onSuccess: () => {
          setPicked([]);
          setSelectedType(null);
        },
        onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
      },
    );
  }

  const heroById = (id: string) => heroList.find((h) => h.id === id);

  return (
    <section className="anim-fade space-y-6">
      <div>
        <h2 className="heading flex items-center gap-2 text-2xl">
          <UiIcon name="map" size={24} color="var(--color-gold-soft)" />
          Expéditions
        </h2>
        <p className="text-sm text-[var(--color-muted)]">
          Envoie une escouade en expédition (plusieurs heures). Elle en revient avec de l'or, de
          l'XP et des <strong>matériaux uniques</strong> introuvables ailleurs. Une équipe plus forte
          revient plus vite.
        </p>
      </div>

      {error && <p className="text-sm text-[var(--color-ember)]">{error}</p>}

      {/* Expéditions en cours */}
      {activeRuns.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-[var(--color-muted)]">En cours</h3>
          {activeRuns.map((run) => (
            <ActiveExpeditionCard
              key={run.id}
              run={run}
              type={(types ?? []).find((t) => t.id === run.expedition_type_id)}
              heroById={heroById}
              onClaim={() =>
                actions.claim.mutate(run.id, {
                  onSuccess: (d) => setRewards(d.rewards),
                  onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
                })
              }
              onCancel={() => actions.cancel.mutate(run.id)}
              busy={actions.claim.isPending || actions.cancel.isPending}
            />
          ))}
        </div>
      )}

      {/* Nouvelle expédition */}
      {isLoading && <p className="text-[var(--color-muted)]">Chargement des expéditions…</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        {(types ?? []).map((t) => (
          <ExpeditionTypeCard
            key={t.id}
            type={t}
            active={selectedType === t.id}
            onClick={() => {
              setSelectedType(t.id);
              setPicked([]);
              setError(null);
            }}
          />
        ))}
      </div>

      {type && (
        <div className="panel space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-semibold text-[var(--color-ink)]">
              Composer l'équipe — {type.name}
            </h3>
            <span className="text-xs text-[var(--color-muted)]">
              {picked.length}/{MAX_TEAM}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {available.length === 0 ? (
              <p className="text-xs text-[var(--color-muted)]">
                Aucun héros disponible (tous engagés ou déployés).
              </p>
            ) : (
              available.map((h) => {
                const chosen = picked.includes(h.id);
                const tooLow = h.level < type.min_level_required;
                return (
                  <button
                    key={h.id}
                    onClick={() => !tooLow && toggleHero(h.id)}
                    disabled={tooLow}
                    title={tooLow ? `Niveau ${type.min_level_required} requis` : h.name}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition ${
                      chosen
                        ? 'border-[var(--color-arcane)] bg-[var(--color-arcane)]/15 text-white'
                        : 'border-[var(--color-edge)] text-[var(--color-muted)] hover:border-[var(--color-edge-strong)]'
                    } ${tooLow ? 'opacity-40' : ''}`}
                  >
                    <ClassIcon classId={h.classId} size={16} />
                    {h.name}
                    <span className="text-[10px] text-[var(--color-muted)]">N.{h.level}</span>
                  </button>
                );
              })
            )}
          </div>

          {picked.length > 0 && (
            <p className="text-xs text-[var(--color-muted)]">
              Durée estimée :{' '}
              <span className="text-[var(--color-ink)]">
                {fmtDuration(
                  computeExpeditionDuration(
                    type,
                    Math.min(...picked.map((id) => heroById(id)?.level ?? 1)),
                  ),
                )}
              </span>
            </p>
          )}

          <button
            onClick={launch}
            disabled={picked.length === 0 || actions.start.isPending}
            className="btn btn-primary w-full text-sm"
          >
            {actions.start.isPending ? 'Départ…' : "Lancer l'expédition"}
          </button>
        </div>
      )}

      {rewards && <RewardsModal rewards={rewards} onClose={() => setRewards(null)} />}
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function ExpeditionTypeCard({
  type,
  active,
  onClick,
}: {
  type: ExpeditionTypeRow;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`panel p-4 text-left transition ${
        active ? 'ring-2 ring-[var(--color-arcane)]' : 'hover:border-[var(--color-edge-strong)]'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-display font-semibold text-[var(--color-ink)]">{type.name}</span>
        <span className="chip bg-white/5 text-[10px] text-[var(--color-muted)]">
          Niv. {type.min_level_required}+
        </span>
      </div>
      <div className="mt-1 text-xs text-[var(--color-muted)]">
        Durée de base : {fmtDuration(type.duration_base_seconds)}
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
        {type.loot_table.map((l) => (
          <span key={l.resource} className="inline-flex items-center gap-1 text-[var(--color-ink)]/80">
            <ResourceIcon resKey={l.resource} /> {resourceMeta(l.resource).label}
          </span>
        ))}
      </div>
    </button>
  );
}

function ActiveExpeditionCard({
  run,
  type,
  heroById,
  onClaim,
  onCancel,
  busy,
}: {
  run: ExpeditionRunRow;
  type: ExpeditionTypeRow | undefined;
  heroById: (id: string) => HeroView | undefined;
  onClaim: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const endsAt = Date.parse(run.ends_at);
  const remaining = (endsAt - now) / 1000;
  const done = remaining <= 0;
  const total = (endsAt - Date.parse(run.started_at)) / 1000;
  const pct = Math.min(100, Math.max(0, Math.round(((total - remaining) / Math.max(1, total)) * 100)));

  return (
    <div className="panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {run.hero_ids.map((id) => {
              const h = heroById(id);
              return (
                <span
                  key={id}
                  title={h?.name}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-edge)] bg-[var(--color-panel-2)]"
                >
                  {h ? <ClassIcon classId={h.classId} size={16} /> : '?'}
                </span>
              );
            })}
          </div>
          <div>
            <div className="font-medium text-[var(--color-ink)]">{type?.name ?? 'Expédition'}</div>
            <div className="text-xs text-[var(--color-muted)]">
              {done ? 'Terminée — prête à réclamer' : `Retour dans ${fmtDuration(remaining)}`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {done ? (
            <button onClick={onClaim} disabled={busy} className="btn btn-primary px-3 py-1.5 text-xs">
              Réclamer
            </button>
          ) : (
            <button onClick={onCancel} disabled={busy} className="btn btn-ghost px-3 py-1.5 text-xs">
              Abandonner
            </button>
          )}
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/40">
        <div
          className="h-full rounded-full bg-[var(--color-arcane)] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function RewardsModal({ rewards, onClose }: { rewards: ExpeditionRewards; onClose: () => void }) {
  return (
    <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="panel anim-pop w-full max-w-sm p-5 text-center">
        <h3 className="heading text-lg">Expédition terminée</h3>
        <div className="mt-3 flex flex-wrap justify-center gap-2 text-xs">
          {rewards.gold > 0 && (
            <span className="chip inline-flex items-center gap-1 bg-[var(--color-gold)]/15 text-[var(--color-gold-soft)]">
              <UiIcon name="gold" size={12} /> +{rewards.gold} or
            </span>
          )}
          {rewards.xp_per_hero > 0 && (
            <span className="chip inline-flex items-center gap-1 bg-[var(--color-arcane)]/20 text-[var(--color-ink)]">
              <UiIcon name="xp" size={12} /> +{rewards.xp_per_hero} XP / héros
            </span>
          )}
          {rewards.loot.map((l) => (
            <span key={l.resource} className="chip inline-flex items-center gap-1 bg-white/5 text-[var(--color-ink)]">
              <ResourceIcon resKey={l.resource} /> +{l.amount} {resourceMeta(l.resource).label}
            </span>
          ))}
        </div>
        <button onClick={onClose} className="btn btn-primary mt-4 w-full text-sm">
          Continuer
        </button>
      </div>
    </div>
  );
}
