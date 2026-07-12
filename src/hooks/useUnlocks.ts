import { useEffect } from 'react';
import { useAccount } from '@/hooks/useAccount';
import { useResources, useResourcesByTier } from '@/hooks/useResources';
import { useProfile } from '@/hooks/useProfile';
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
  const { isLoading: resLoading } = useResources();
  const resByTier = useResourcesByTier();
  const { data: profile } = useProfile();
  const { data: deployments } = useDeployments();
  const { data: cleared } = useLevelProgress();
  const localLost = useOnboardingStore((s) => s.hasLost);
  const clearDefeat = useOnboardingStore((s) => s.clearDefeat);

  // Le Sac se débloque au 1er matériau ramassé, TOUS ARCS confondus : sinon passer
  // en arc 2 (aucun matériau T2 au départ) re-verrouillerait le sac et relancerait
  // le popup de déblocage à chaque bascule d'arc.
  const hasMaterial = Object.values(resByTier).some((byRes) =>
    Object.values(byRes).some((v) => (v ?? 0) > 0),
  );

  // Trace de progression stockée côté serveur, donc suit le joueur d'une machine à
  // l'autre. Un joueur qui a gagné de l'XP de compte ou validé un niveau a forcément
  // dépassé le tout début du jeu → village/taverne débloqués, même si le RPC
  // `record_defeat` n'a jamais persisté sa 1re défaite (échec réseau, défaite d'avant
  // la migration, ou plus aucune défaite depuis). On garde EXACTEMENT le heuristique
  // du backfill serveur (0053) : ces signaux n'apparaissent qu'APRÈS avoir accompli
  // quelque chose — jamais sur un simple déploiement — pour préserver le beat « perds
  // d'abord » du tuto d'onboarding (étape first-fight → villageUnlocked).
  const dataReady =
    !account.isLoading && !resLoading && deployments !== undefined && cleared !== undefined;
  const hasProgression = account.xp > 0 || (cleared?.size ?? 0) > 0;

  // Débloqué si : défaite mémorisée (flag local immédiat OU persistée en DB) OU
  // n'importe quel signe de progression serveur (robuste au cross-device).
  const hasLost = localLost || Boolean(profile?.has_lost) || (dataReady && hasProgression);

  // Compte « tout neuf » (nouvelle partie ou reset serveur) : aucun signe de
  // progression → on oublie la défaite mémorisée (village/taverne re-verrouillés).
  const isFresh = dataReady && !hasProgression;

  useEffect(() => {
    if (isFresh) clearDefeat();
  }, [isFresh, clearDefeat]);

  // Un compte fraîchement remis à zéro re-verrouille village/taverne même si un
  // flag de défaite traînait encore (local ou DB non nettoyée).
  const state: UnlockState = {
    level: account.level,
    hasMaterial,
    hasLost: hasLost && !isFresh,
  };

  return {
    isLoading: account.isLoading || resLoading,
    level: state.level,
    hasMaterial: state.hasMaterial,
    hasLost: state.hasLost,
    unlocked: (a: ActivityKey) => activityUnlocked(a, state),
  };
}
