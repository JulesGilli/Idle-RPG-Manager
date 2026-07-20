import { useMemo } from 'react';
import { useDeployments } from '@/features/maps/useMaps';
import { useActiveExpeditions } from '@/features/expedition/useExpedition';

/**
 * Disponibilité d'un héros pour lancer une activité.
 * - `free`       : libre.
 * - `advance`    : dans un déploiement d'assauts manuels → considéré DISPONIBLE
 *                  (le serveur le redéploie/réutilise sans souci).
 * - `loop`       : en farm automatique → OCCUPÉ.
 * - `expedition` : parti en expédition qui VERROUILLE → OCCUPÉ.
 *
 * Une expédition immobilise son escouade par défaut. Le palier d'arbre
 * « Intendance autonome » (niveau 6) crée des runs `locks_heroes = false` :
 * ceux-là ne sont pas listés ici du tout, leurs héros restent disponibles.
 */
export type HeroStatus = 'free' | 'advance' | 'loop' | 'expedition';

export const HERO_STATUS_LABEL: Record<HeroStatus, string> = {
  free: 'Disponible',
  advance: 'Déployé',
  loop: 'En farm',
  expedition: 'En expédition',
};

/** Un héros est indisponible s'il farme en boucle ou part en expédition verrouillante. */
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
    // L'expédition reprime sur le farm : elle immobilise de nouveau. Mais SEULS
    // les runs verrouillants comptent — ceux lancés avec « Intendance autonome »
    // laissent leur escouade entièrement libre.
    for (const r of expeditions ?? []) {
      if (r.locks_heroes === false) continue;
      for (const h of r.hero_ids) m.set(h, 'expedition');
    }
    return m;
  }, [deployments, expeditions]);
}
