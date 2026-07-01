import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

export type EnemyConfig = {
  enemies: { name: string; hp: number; atk: number; def: number; speed: number }[];
};

export type DungeonView = {
  id: string;
  name: string;
  difficulty: number;
  enemies: EnemyConfig['enemies'];
};

export function useDungeons() {
  return useQuery({
    queryKey: ['dungeons'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<DungeonView[]> => {
      const { data, error } = await supabase
        .from('dungeons')
        .select('id, name, difficulty, enemy_config')
        .order('difficulty', { ascending: true });
      if (error) throw error;

      return (data ?? []).map((d) => ({
        id: d.id,
        name: d.name,
        difficulty: d.difficulty,
        enemies: (d.enemy_config as unknown as EnemyConfig).enemies,
      }));
    },
  });
}
