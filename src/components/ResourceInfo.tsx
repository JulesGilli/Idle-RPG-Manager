import { useCallback, useState, type ReactNode } from 'react';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { ResourceInfoCtx } from '@/components/resourceInfoContext';
import { resourceMeta, useResourcesByTier } from '@/hooks/useResources';
import { resourceSource } from '@/lib/resourceSources';

/**
 * FICHE « OÙ FARMER » GLOBALE.
 *
 * Le survol d'une icône de ressource donne déjà sa provenance (infobulle native
 * de `ResourceIcon`), mais le survol n'existe pas sur mobile — et la zone
 * survolable se limite à une icône de 12 px. Ce contexte offre le pendant
 * tactile : n'importe quelle icône de ressource, dans N'IMPORTE QUEL écran
 * (forge, joaillerie, autel, oratoire, runes, inventaire, encyclopédie…), ouvre
 * la même fiche. Une seule implémentation, montée une fois dans `AppLayout`.
 */
export function ResourceInfoProvider({ children }: { children: ReactNode }) {
  const [resKey, setResKey] = useState<string | null>(null);
  const open = useCallback((k: string) => setResKey(k), []);

  return (
    <ResourceInfoCtx.Provider value={open}>
      {children}
      {resKey && <ResourceInfoSheet resKey={resKey} onClose={() => setResKey(null)} />}
    </ResourceInfoCtx.Provider>
  );
}

function ResourceInfoSheet({ resKey, onClose }: { resKey: string; onClose: () => void }) {
  const byTier = useResourcesByTier();
  // Toutes piles confondues : la fiche répond « combien j'en ai », pas « dans quel arc ».
  const owned = Object.values(byTier ?? {}).reduce((n, res) => n + (res[resKey] ?? 0), 0);
  const source = resourceSource(resKey);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onClose}
    >
      <div
        className="panel anim-pop w-full max-w-md space-y-3 rounded-t-2xl p-4 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/[0.04]">
            <ResourceIcon resKey={resKey} size={24} noInfo />
          </span>
          <div className="min-w-0">
            <div className="font-display font-bold text-[var(--color-ink)]">
              {resourceMeta(resKey).label}
            </div>
            <div className="text-xs tabular-nums text-[var(--color-muted)]">
              En réserve : {owned}
            </div>
          </div>
        </div>
        <div className="rounded-lg bg-black/20 p-3">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-[var(--color-muted)]">
            Où en trouver
          </div>
          <p className="text-sm leading-snug text-[var(--color-ink)]/90">
            {source ?? 'Provenance inconnue — probablement une ressource historique.'}
          </p>
        </div>
        <button onClick={onClose} className="btn btn-ghost w-full text-xs">
          Fermer
        </button>
      </div>
    </div>
  );
}
