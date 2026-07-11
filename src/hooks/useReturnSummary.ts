import { useMemo } from 'react';
import { useDeployments } from '@/features/maps/useMaps';
import { useActiveExpeditions } from '@/features/expedition/useExpedition';
import { useDungeonTypes, useDungeonCooldowns } from '@/features/dungeon/useDungeon';
import { useDailyReward } from '@/features/daily/useDailyReward';
import { fightsForElapsed } from '@shared/progression/deployment';
import { dungeonCooldownRemaining } from '@shared/progression/dungeon';

/**
 * Résumé « content de te revoir » : ce qui t'attend vraiment au retour, à partir
 * de l'état réel du jeu (aucune récompense inventée — on POINTE le butin en
 * attente, on ne le distribue pas). Sert l'écran de retour idle.
 * - `mapFights`      : combats de carte accumulés hors-ligne (déploiements actifs).
 * - `expeditionsDone`: expéditions terminées, butin à réclamer.
 * - `dungeonsReady`  : donjons déjà joués ressortis de cooldown.
 * - `dailyClaim`     : récompense journalière disponible.
 */
export type ReturnSummary = {
  ready: boolean;
  mapFights: number;
  expeditionsDone: number;
  dungeonsReady: number;
  dailyClaim: boolean;
  /** Nombre de rubriques actionnables (>0 = il y a de quoi afficher l'écran). */
  count: number;
};

export function useReturnSummary(): ReturnSummary {
  const { data: deployments, isSuccess: depOk } = useDeployments();
  const { data: expeditions, isSuccess: expOk } = useActiveExpeditions();
  const { data: dungeonTypes } = useDungeonTypes();
  const { data: cooldowns, isSuccess: cdOk } = useDungeonCooldowns();
  const { data: daily } = useDailyReward();

  return useMemo(() => {
    const now = Date.now();

    const mapFights = (deployments ?? [])
      .filter((d) => !d.blocked)
      .reduce((sum, d) => sum + fightsForElapsed((now - Date.parse(d.last_resolved_at)) / 1000), 0);

    const expeditionsDone = (expeditions ?? []).filter((r) => Date.parse(r.ends_at) <= now).length;

    const dungeonsReady = (dungeonTypes ?? []).filter(
      (dj) => cooldowns && dj.id in cooldowns && dungeonCooldownRemaining(cooldowns[dj.id] ?? null, dj.tier, now) === 0,
    ).length;

    const dailyClaim = Boolean(daily?.canClaim);

    const count =
      (mapFights > 0 ? 1 : 0) +
      (expeditionsDone > 0 ? 1 : 0) +
      (dungeonsReady > 0 ? 1 : 0) +
      (dailyClaim ? 1 : 0);

    // « prêt » = les requêtes clés ont répondu (évite un écran vide/faux au boot).
    const ready = depOk && expOk && cdOk;

    return { ready, mapFights, expeditionsDone, dungeonsReady, dailyClaim, count };
  }, [deployments, expeditions, dungeonTypes, cooldowns, daily, depOk, expOk, cdOk]);
}
