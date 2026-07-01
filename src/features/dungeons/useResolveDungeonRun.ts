import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import type { CombatEvent, CombatantFinalState } from '@shared/combat';
import type { ItemDrop } from '@shared/progression/loot';

export type RunRewards = {
  xp: number;
  items: ItemDrop[];
  level_ups: { hero_id: string; levels: number }[];
};

export type ResolveRunResponse = {
  result: 'win' | 'loss';
  seed: number;
  rounds: number;
  events: CombatEvent[];
  final_state: CombatantFinalState[];
  rewards: RunRewards | null;
};

type ResolveRunInput = { dungeonId: string; heroIds: string[] };

export function useResolveDungeonRun() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  return useMutation({
    mutationFn: async ({ dungeonId, heroIds }: ResolveRunInput): Promise<ResolveRunResponse> => {
      const { data, error } = await supabase.functions.invoke<ResolveRunResponse>(
        'resolve-dungeon-run',
        { body: { dungeon_id: dungeonId, hero_ids: heroIds } },
      );
      if (error) throw error;
      if (!data) throw new Error('Réponse vide du serveur');
      return data;
    },
    onSuccess: () => {
      // La progression a changé côté serveur : on rafraîchit héros, inventaire, classement.
      void queryClient.invalidateQueries({ queryKey: ['heroes', userId] });
      void queryClient.invalidateQueries({ queryKey: ['items', userId] });
      void queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
    },
  });
}
