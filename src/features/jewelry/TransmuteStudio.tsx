/**
 * ATELIER DE TRANSMUTATION — la soupape du stock de gemmes.
 *
 * Deux choix seulement, dans cet ordre : la gemme VOULUE (elle fixe la zone
 * dont il faudra les composants), puis la gemme SACRIFIÉE (n'importe laquelle).
 * L'ordre compte : c'est la cible qui détermine le prix, l'annoncer en premier
 * évite au joueur de découvrir le coût après avoir choisi sa monnaie.
 */
import { useMemo, useState } from 'react';
import { useResources, resourceMeta } from '@/hooks/useResources';
import { useForge } from '@/features/forge/useForge';
import { useArc } from '@/features/arc/useArc';
import { gemsForArc } from '@shared/progression/arcMaterials';
import {
  gemTransmuteRecipe,
  TRANSMUTE_GEM_QTY,
  TRANSMUTE_MATERIAL_QTY,
} from '@shared/progression/transmute';
import { PASSIVE_META, type GemDef } from '@shared/progression/jewelry';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { PassiveIcon, UiIcon } from '@/components/synty/GameIcons';

export function TransmuteStudio() {
  const { data: resources } = useResources();
  const { currentArc } = useArc();
  const { transmuteGem } = useForge();

  const gems = useMemo(() => gemsForArc(currentArc), [currentArc]);
  const res: Record<string, number> = resources ?? {};

  const [targetId, setTargetId] = useState<string>(gems[gems.length - 1]?.id ?? '');
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [done, setDone] = useState<GemDef | null>(null);
  const [error, setError] = useState<string | null>(null);

  const target = gems.find((g) => g.id === targetId) ?? gems[0]!;
  const source = sourceId ? (gems.find((g) => g.id === sourceId) ?? null) : null;
  const recipe = source ? gemTransmuteRecipe(source, target, currentArc) : null;

  // Le composant exigé dépend de la CIBLE seule : on peut donc l'annoncer avant
  // même que le joueur ait choisi la gemme qu'il sacrifie.
  const matKey = gemTransmuteRecipe(gems.find((g) => g.id !== target.id)!, target, currentArc)
    ?.materials[1]?.key;
  const matOwned = matKey ? (res[matKey] ?? 0) : 0;
  const matOk = matOwned >= TRANSMUTE_MATERIAL_QTY;
  const gemOk = source ? (res[source.id] ?? 0) >= TRANSMUTE_GEM_QTY : false;
  const canRun = Boolean(recipe) && matOk && gemOk && !transmuteGem.isPending;

  const run = () => {
    if (!source || !canRun) return;
    setError(null);
    setDone(null);
    transmuteGem.mutate(
      { gemId: source.id, targetGemId: target.id },
      {
        onSuccess: () => {
          setDone(target);
          setSourceId(null);
        },
        onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Transmutation refusée'),
      },
    );
  };

  return (
    <div className="space-y-5">
      <div className="panel space-y-1 p-4">
        <h3 className="heading flex items-center gap-2 text-lg">
          <UiIcon name="refine" size={18} /> Transmutation
        </h3>
        <p className="text-sm text-[var(--color-muted)]">
          Sacrifie <strong>{TRANSMUTE_GEM_QTY} gemmes identiques</strong> — n’importe lesquelles —
          et <strong>{TRANSMUTE_MATERIAL_QTY} composants de la zone visée</strong> pour obtenir la
          gemme de ton choix.
        </p>
      </div>

      {/* 1. La gemme voulue — elle fixe le composant à payer. */}
      <div className="panel space-y-3 p-4">
        <h4 className="text-sm font-semibold text-[var(--color-ink)]">1. Gemme voulue</h4>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {gems.map((g) => {
            const meta = PASSIVE_META[g.passive];
            return (
              <button
                key={g.id}
                onClick={() => {
                  setTargetId(g.id);
                  if (sourceId === g.id) setSourceId(null);
                  setDone(null);
                  setError(null);
                }}
                title={meta.desc}
                className={`flex items-center gap-2 rounded-lg border p-2 text-left transition ${
                  g.id === target.id
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10'
                    : 'border-[var(--color-line)] hover:border-[var(--color-accent)]/50'
                }`}
              >
                <ResourceIcon resKey={g.id} size={22} />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium text-[var(--color-ink)]">
                    {g.label}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-[var(--color-muted)]">
                    <PassiveIcon passive={g.passive} size={10} /> {g.passiveLabel} · zone {g.zone}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {matKey ? (
          <p className={`text-xs ${matOk ? 'text-[var(--color-muted)]' : 'text-red-400'}`}>
            Coût en composants : {TRANSMUTE_MATERIAL_QTY} × {resourceMeta(matKey).label} — tu en as{' '}
            {matOwned}.
          </p>
        ) : null}
      </div>

      {/* 2. La gemme sacrifiée — seules celles qu'on possède en double comptent. */}
      <div className="panel space-y-3 p-4">
        <h4 className="text-sm font-semibold text-[var(--color-ink)]">2. Gemmes sacrifiées</h4>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {gems
            .filter((g) => g.id !== target.id)
            .map((g) => {
              const owned = res[g.id] ?? 0;
              const enough = owned >= TRANSMUTE_GEM_QTY;
              return (
                <button
                  key={g.id}
                  onClick={() => {
                    setSourceId(g.id);
                    setDone(null);
                    setError(null);
                  }}
                  disabled={!enough}
                  title={enough ? undefined : `Il t’en faut ${TRANSMUTE_GEM_QTY}`}
                  className={`flex items-center gap-2 rounded-lg border p-2 text-left transition disabled:opacity-40 ${
                    g.id === sourceId
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10'
                      : 'border-[var(--color-line)] hover:border-[var(--color-accent)]/50'
                  }`}
                >
                  <ResourceIcon resKey={g.id} size={22} />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-[var(--color-ink)]">
                      {g.label}
                    </span>
                    <span className="text-[10px] text-[var(--color-muted)]">
                      tu en as {owned} / {TRANSMUTE_GEM_QTY}
                    </span>
                  </span>
                </button>
              );
            })}
        </div>
      </div>

      {/* 3. L'échange. */}
      <div className="panel space-y-3 p-4">
        {source ? (
          <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--color-ink)]">
            <ResourceIcon resKey={source.id} size={20} /> {TRANSMUTE_GEM_QTY} × {source.label}
            {matKey ? (
              <>
                <span className="text-[var(--color-muted)]">+</span>
                <ResourceIcon resKey={matKey} size={20} /> {TRANSMUTE_MATERIAL_QTY} ×{' '}
                {resourceMeta(matKey).label}
              </>
            ) : null}
            <span className="text-[var(--color-muted)]">→</span>
            <ResourceIcon resKey={target.id} size={20} /> 1 × {target.label}
          </p>
        ) : (
          <p className="text-sm text-[var(--color-muted)]">
            Choisis les gemmes à sacrifier pour voir l’échange.
          </p>
        )}
        <button className="btn btn-primary" onClick={run} disabled={!canRun}>
          {transmuteGem.isPending ? 'Transmutation…' : 'Transmuter'}
        </button>
        {done ? (
          <p className="text-sm text-emerald-400">
            Tu obtiens 1 × {done.label} — ajoutée à tes ressources.
          </p>
        ) : null}
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
      </div>
    </div>
  );
}
