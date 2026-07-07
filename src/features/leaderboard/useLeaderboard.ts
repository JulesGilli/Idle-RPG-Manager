import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';

// hero_public n'est pas dans les types générés → client permissif pour la lecture.
const pdb = supabase as unknown as SupabaseClient;

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

/** Héros (vue simplifiée publique) d'un joueur — pour sa fiche personnage. */
export type PublicHero = {
  id: string;
  name: string;
  class_id: string;
  level: number;
  atk: number;
  def: number;
  hp: number;
  speed: number;
  power: number;
};

export function usePlayerHeroes(playerId: string | null) {
  return useQuery({
    queryKey: ['player_heroes', playerId],
    enabled: Boolean(playerId),
    queryFn: async (): Promise<PublicHero[]> => {
      const { data, error } = await pdb
        .from('hero_public')
        .select('id, name, class_id, level, atk, def, hp, speed, power')
        .eq('owner_id', playerId!)
        .order('power', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as PublicHero[]).map((h) => ({
        id: h.id,
        name: h.name,
        class_id: h.class_id,
        level: h.level ?? 1,
        atk: h.atk ?? 0,
        def: h.def ?? 0,
        hp: h.hp ?? 0,
        speed: h.speed ?? 0,
        power: h.power ?? 0,
      }));
    },
  });
}
