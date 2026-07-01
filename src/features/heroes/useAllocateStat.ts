import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import { heroesQueryKey } from './useHeroes';
import type { StatKey } from '@shared/progression/formulas';

export function useAllocateStat() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  return useMutation({
    mutationFn: async (args: { heroId: string; stat: StatKey }) => {
      const { error } = await supabase.rpc('allocate_stat', {
        p_hero_id: args.heroId,
        p_stat: args.stat,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: heroesQueryKey(userId) });
      void queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
    },
  });
}
