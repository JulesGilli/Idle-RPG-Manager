import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import type { DungeonFightResult } from '@/features/dungeon/useDungeon';

// Les tables arc_bosses / player_arc_progress ne sont pas (encore) dans les types
// générés → client permissif pour ces lectures (mêmes lignes re-typées ci-dessous).
const adb = supabase as unknown as SupabaseClient;

export type ArcBossRow = {
  id: string;
  arc_id: string;
  name: string;
  tier: number;
  unlocks_tier: number;
  required_level_id: string | null;
  monster_sequence: { name: string; enemies: unknown[] }[];
};

export type ArcBossRunResponse = {
  success: boolean;
  reached_index: number;
  seed: number;
  arc_boss: { id: string; name: string; unlocks_tier: number };
  fight_results: DungeonFightResult[];
  loot: { resource: string; amount: number }[];
};

/** Boss d'arc (table de référence, lecture publique authentifiée). */
export function useArcBosses() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['arc_bosses'],
    enabled: Boolean(userId),
    queryFn: async (): Promise<ArcBossRow[]> => {
      const { data, error } = await adb
        .from('arc_bosses')
        .select('id, arc_id, name, tier, unlocks_tier, required_level_id, monster_sequence')
        .order('tier', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ArcBossRow[];
    },
  });
}

/** Boss d'arc déjà vaincus par le joueur (RLS select own). */
export function useArcProgress() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['arc_progress', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await adb
        .from('player_arc_progress')
        .select('gate_boss_id')
        .eq('player_id', userId!);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.gate_boss_id as string));
    },
  });
}

async function invoke(body: Record<string, unknown>): Promise<ArcBossRunResponse> {
  const { data, error } = await supabase.functions.invoke<ArcBossRunResponse>('resolve-arc-boss', {
    body,
  });
  if (error) {
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

export function useResolveArcBoss() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  return useMutation({
    mutationFn: (args: { arcBossId: string; heroIds: string[] }) =>
      invoke({ arc_boss_id: args.arcBossId, hero_ids: args.heroIds }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['resources', userId] });
      void queryClient.invalidateQueries({ queryKey: ['arc_progress', userId] });
    },
  });
}
