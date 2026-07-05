import { useEffect } from 'react';
import { useAccount } from '@/hooks/useAccount';
import { useResources } from '@/hooks/useResources';
import { useDeployments, useLevelProgress } from '@/features/maps/useMaps';
import { useOnboardingStore } from '@/store/onboardingStore';
import { ACTIVITY_UNLOCKS, type ActivityKey } from '@shared/progression/account.ts';

/**
 * Déblocage des activités, jalons d'onboarding compris :
 *  - `inventory` (Sac)  → au PREMIER MATÉRIAU ramassé (dérivé du serveur).
 *  - `village`/`tavern` → à la PREMIÈRE DÉFAITE, prise en compte à la FIN du combat
 *    dans l'UI (voir onboardingStore, alimenté depuis l'écran de carte).
 *  - le reste           → au NIVEAU DE COMPTE requis.
 */

export type UnlockState = { level: number; hasMaterial: boolean; hasLost: boolean };

/** Prédicat pur : une activité est-elle débloquée dans cet état ? */
export function activityUnlocked(activity: ActivityKey, s: UnlockState): boolean {
  if (activity === 'inventory') return s.hasMaterial;
  if (activity === 'village' || activity === 'tavern') return s.hasLost;
  return s.level >= ACTIVITY_UNLOCKS[activity];
}

export function useUnlocks() {
  const account = useAccount();
  const { data: resources, isLoading: resLoading } = useResources();
  const { data: deployments } = useDeployments();
  const { data: cleared } = useLevelProgress();
  const hasLost = useOnboardingStore((s) => s.hasLost);
  const clearDefeat = useOnboardingStore((s) => s.clearDefeat);

  const hasMaterial = Object.values(resources ?? {}).some((v) => (v ?? 0) > 0);

  // Compte « tout neuf » (nouvelle partie ou reset serveur) : aucun signe de
  // progression → on oublie la défaite mémorisée (village/taverne re-verrouillés).
  const dataReady =
    !account.isLoading && !resLoading && deployments !== undefined && cleared !== undefined;
  const isFresh =
    dataReady &&
    account.xp === 0 &&
    !hasMaterial &&
    (deployments?.length ?? 0) === 0 &&
    (cleared?.size ?? 0) === 0;

  useEffect(() => {
    if (isFresh) clearDefeat();
  }, [isFresh, clearDefeat]);

  const state: UnlockState = { level: account.level, hasMaterial, hasLost };

  return {
    isLoading: account.isLoading || resLoading,
    level: state.level,
    hasMaterial: state.hasMaterial,
    hasLost: state.hasLost,
    unlocked: (a: ActivityKey) => activityUnlocked(a, state),
  };
}
