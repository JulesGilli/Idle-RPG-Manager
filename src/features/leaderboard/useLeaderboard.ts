import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

export type LeaderboardRow = {
  player_id: string;
  display_name: string;
  total_power: number;
  levels_cleared: number;
  max_difficulty: number;
  gold: number;
};

export function useLeaderboard() {
  return useQuery({
    queryKey: ['leaderboard'],
    queryFn: async (): Promise<LeaderboardRow[]> => {
      const { data, error } = await supabase
        .from('leaderboard')
        .select('player_id, display_name, total_power, levels_cleared, max_difficulty, gold')
        .order('total_power', { ascending: false })
        .order('levels_cleared', { ascending: false })
        .limit(100);
      if (error) throw error;

      return (data ?? []).map((r) => ({
        player_id: r.player_id ?? '',
        display_name: r.display_name ?? 'Commandant',
        total_power: r.total_power ?? 0,
        levels_cleared: r.levels_cleared ?? 0,
        max_difficulty: r.max_difficulty ?? 0,
        gold: r.gold ?? 0,
      }));
    },
  });
}
