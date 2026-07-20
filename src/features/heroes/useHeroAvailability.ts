import { useMemo } from 'react';
import { useDeployments } from '@/features/maps/useMaps';
import { useActiveExpeditions } from '@/features/expedition/useExpedition';

/**
 * Disponibilité d'un héros pour lancer une activité.
 * - `free`       : libre.
 * - `advance`    : dans un déploiement d'assauts manuels → considéré DISPONIBLE
 *                  (le serveur le redéploie/réutilise sans souci).
 * - `loop`       : en farm automatique → OCCUPÉ.
 * - `expedition` : parti en expédition → DISPONIBLE quand même. L'expédition
 *                  tourne en arrière-plan et n'immobilise plus personne ; le
 *                  statut n'est plus qu'une INFORMATION affichée, jamais un
 *                  verrou. Le serveur ne le vérifie plus nulle part.
 */
export type HeroStatus = 'free' | 'advance' | 'loop' | 'expedition';

export const HERO_STATUS_LABEL: Record<HeroStatus, string> = {
  free: 'Disponible',
  advance: 'Déployé',
  loop: 'En farm',
  expedition: 'En expédition',
};

/** Un héros n'est indisponible que s'il farme en boucle. */
export function heroIsBusy(status: HeroStatus | undefined): boolean {
  return status === 'loop';
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
    // L'expédition ne prime PLUS : elle n'immobilise personne, alors que le farm
    // en boucle, si. Un héros à la fois en farm et en expédition doit rester
    // marqué « en farm » — l'inverse le déclarerait disponible à tort.
    for (const r of expeditions ?? []) for (const h of r.hero_ids) if (!m.has(h)) m.set(h, 'expedition');
    return m;
  }, [deployments, expeditions]);
}
