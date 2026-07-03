import { useMemo } from 'react';
import { useDeployments } from '@/features/maps/useMaps';
import { useActiveExpeditions } from '@/features/expedition/useExpedition';

/**
 * Disponibilité d'un héros pour lancer une activité.
 * - `free`       : libre.
 * - `advance`    : dans un déploiement d'assauts manuels → considéré DISPONIBLE
 *                  (le serveur le redéploie/réutilise sans souci).
 * - `loop`       : en farm automatique → OCCUPÉ.
 * - `expedition` : parti en expédition (plusieurs heures) → OCCUPÉ.
 */
export type HeroStatus = 'free' | 'advance' | 'loop' | 'expedition';

export const HERO_STATUS_LABEL: Record<HeroStatus, string> = {
  free: 'Disponible',
  advance: 'Déployé',
  loop: 'En farm',
  expedition: 'En expédition',
};

/** Un héros est indisponible pour une nouvelle activité s'il farme ou est en expédition. */
export function heroIsBusy(status: HeroStatus | undefined): boolean {
  return status === 'loop' || status === 'expedition';
}

export function useHeroAvailability(): Map<string, HeroStatus> {
  const { data: deployments } = useDeployments();
  const { data: expeditions } = useActiveExpeditions();

  return useMemo(() => {
    const m = new Map<string, HeroStatus>();
    for (const d of deployments ?? []) {
      for (const h of d.hero_ids) {
        if (d.mode === 'loop') m.set(h, 'loop');
        else if (!m.has(h)) m.set(h, 'advance');
      }
    }
    // L'expédition prime (activité la plus « bloquante »).
    for (const r of expeditions ?? []) for (const h of r.hero_ids) m.set(h, 'expedition');
    return m;
  }, [deployments, expeditions]);
}
