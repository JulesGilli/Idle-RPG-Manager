import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import type { StoredCombat } from '@/components/CombatReplay';

export type DeploymentClaimSummary = {
  deployment_id: string;
  level_name: string;
  wins: number;
  losses: number;
  xp_per_hero: number;
  gold: number;
  level_ups: { hero_id: string; levels: number }[];
  advanced: number;
  blocked: boolean;
};

export type ClaimResponse = {
  results: DeploymentClaimSummary[];
  totals: { gold: number; resources: Record<string, number> } | null;
};

export type FightRewards = {
  xp_per_hero: number;
  gold: number;
  level_ups: { hero_id: string; levels: number }[];
  resources: Record<string, number>;
  advanced: number;
  level_name: string;
};

export type FightResponse = {
  result: 'win' | 'loss';
  combat: StoredCombat;
  rewards: FightRewards;
};

type Action =
  | { action: 'deploy'; level_id: string; hero_ids: string[]; mode: 'advance' | 'loop' }
  | { action: 'undeploy'; deployment_id: string }
  | { action: 'setmode'; deployment_id: string; mode: 'advance' | 'loop' }
  | { action: 'fight'; deployment_id: string }
  | { action: 'claim' };

async function invoke<T>(body: Action): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('resolve-deployment', { body });
  if (error) {
    // Remonte le message d'erreur métier renvoyé par l'Edge Function.
    let msg = error.message;
    const ctx = (error as unknown as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const j = (await ctx.json()) as { error?: string };
        if (j?.error) msg = j.error;
      } catch {
        /* ignore */
      }
    }
    throw new Error(msg);
  }
  if (!data) throw new Error('Réponse vide du serveur');
  return data;
}

export function useDeploymentActions() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  const invalidateDeployments = () => {
    void queryClient.invalidateQueries({ queryKey: ['deployments', userId] });
    void queryClient.invalidateQueries({ queryKey: ['level_progress', userId] });
  };

  const invalidateAll = () => {
    invalidateDeployments();
    void queryClient.invalidateQueries({ queryKey: ['heroes', userId] });
    void queryClient.invalidateQueries({ queryKey: ['items', userId] });
    void queryClient.invalidateQueries({ queryKey: ['profile', userId] });
    void queryClient.invalidateQueries({ queryKey: ['resources', userId] });
    void queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
  };

  const deploy = useMutation({
    mutationFn: (args: { levelId: string; heroIds: string[]; mode: 'advance' | 'loop' }) =>
      invoke<{ ok: true }>({
        action: 'deploy',
        level_id: args.levelId,
        hero_ids: args.heroIds,
        mode: args.mode,
      }),
    onSuccess: invalidateDeployments,
  });

  const undeploy = useMutation({
    mutationFn: (deploymentId: string) =>
      invoke<{ ok: true }>({ action: 'undeploy', deployment_id: deploymentId }),
    onSuccess: invalidateDeployments,
  });

  const setMode = useMutation({
    mutationFn: (args: { deploymentId: string; mode: 'advance' | 'loop' }) =>
      invoke<{ ok: true }>({
        action: 'setmode',
        deployment_id: args.deploymentId,
        mode: args.mode,
      }),
    onSuccess: invalidateDeployments,
  });

  const fight = useMutation({
    mutationFn: (deploymentId: string) =>
      invoke<FightResponse>({ action: 'fight', deployment_id: deploymentId }),
    onSuccess: invalidateAll,
  });

  const claim = useMutation({
    mutationFn: () => invoke<ClaimResponse>({ action: 'claim' }),
    onSuccess: invalidateAll,
  });

  return { deploy, undeploy, setMode, fight, claim };
}
