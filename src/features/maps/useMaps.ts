import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';

export type LevelRow = {
  id: string;
  map_id: string;
  level_index: number;
  difficulty: number;
  name: string;
  enemyCount: number;
  isBoss: boolean;
};

export type MapRow = {
  id: string;
  name: string;
  accent: string;
  levels: LevelRow[];
};

export type DeploymentRow = {
  id: string;
  level_id: string;
  hero_ids: string[];
  mode: 'advance' | 'loop';
  last_resolved_at: string;
  last_combat: unknown;
  last_wins: number;
  last_losses: number;
  last_fights: number;
  blocked: boolean;
  clears_count: number;
};

type EnemyConfig = { enemies: unknown[] };

export function useMaps() {
  return useQuery({
    queryKey: ['maps'],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<MapRow[]> => {
      const [{ data: maps, error: mapsErr }, { data: levels, error: lvlErr }] = await Promise.all([
        supabase.from('maps').select('id, name, accent, sort').order('sort'),
        supabase
          .from('levels')
          .select('id, map_id, level_index, difficulty, name, is_boss, enemy_config')
          .order('level_index'),
      ]);
      if (mapsErr) throw mapsErr;
      if (lvlErr) throw lvlErr;

      return (maps ?? []).map((m) => ({
        id: m.id,
        name: m.name,
        accent: m.accent,
        levels: (levels ?? [])
          .filter((l) => l.map_id === m.id)
          .map((l) => ({
            id: l.id,
            map_id: l.map_id,
            level_index: l.level_index,
            difficulty: l.difficulty,
            name: l.name,
            enemyCount: (l.enemy_config as unknown as EnemyConfig).enemies.length,
            isBoss: l.is_boss,
          })),
      }));
    },
  });
}

export function useLevelProgress() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['level_progress', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from('level_progress')
        .select('level_id')
        .eq('player_id', userId!);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.level_id));
    },
  });
}

export function useDeployments() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['deployments', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<DeploymentRow[]> => {
      const { data, error } = await supabase
        .from('deployments')
        .select(
          'id, level_id, hero_ids, mode, last_resolved_at, last_combat, last_wins, last_losses, last_fights, blocked, clears_count',
        )
        .eq('player_id', userId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((d) => ({
        id: d.id,
        level_id: d.level_id,
        hero_ids: d.hero_ids,
        mode: d.mode === 'loop' ? 'loop' : 'advance',
        last_resolved_at: d.last_resolved_at,
        last_combat: d.last_combat,
        last_wins: d.last_wins,
        last_losses: d.last_losses,
        last_fights: d.last_fights,
        blocked: d.blocked,
        clears_count: d.clears_count,
      }));
    },
  });
}
