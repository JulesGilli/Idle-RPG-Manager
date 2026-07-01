import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import type { ItemDrop } from '@shared/progression/loot';

export type DeploymentClaimSummary = {
  deployment_id: string;
  level_name: string;
  wins: number;
  losses: number;
  xp_per_hero: number;
  gold: number;
  resources: { iron: number; essence: number };
  items: ItemDrop[];
  level_ups: { hero_id: string; levels: number }[];
  advanced: number;
};

export type ClaimResponse = {
  results: DeploymentClaimSummary[];
  totals: { gold: number; resources: { iron: number; essence: number } } | null;
};

type Action =
  | { action: 'deploy'; level_id: string; hero_ids: string[]; mode: 'advance' | 'loop' }
  | { action: 'undeploy'; deployment_id: string }
  | { action: 'setmode'; deployment_id: string; mode: 'advance' | 'loop' }
  | { action: 'claim' };

async function invoke<T>(body: Action): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('resolve-deployment', { body });
  if (error) throw error;
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

  const claim = useMutation({
    mutationFn: () => invoke<ClaimResponse>({ action: 'claim' }),
    onSuccess: invalidateAll,
  });

  return { deploy, undeploy, setMode, claim };
}
