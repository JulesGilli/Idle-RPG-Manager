import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import { heroesQueryKey } from '@/features/heroes/useHeroes';
import type { ExpeditionLootEntry } from '@shared/progression/expedition';

export type ExpeditionTypeRow = {
  id: string;
  name: string;
  min_level_required: number;
  min_power_required: number;
  duration_base_seconds: number;
  loot_table: ExpeditionLootEntry[];
};

export type ExpeditionRunRow = {
  id: string;
  expedition_type_id: string;
  hero_ids: string[];
  started_at: string;
  ends_at: string;
  status: 'in_progress' | 'claimed';
};

export type ExpeditionRewards = {
  gold: number;
  xp_per_hero: number;
  loot: { resource: string; amount: number }[];
  level_ups: { hero_id: string; levels: number }[];
  /** XP de maîtrise d'expédition gagnée par cette réclamation. */
  expedition_xp?: number;
};

/** Types d'expédition (table de référence, lecture publique authentifiée). */
export function useExpeditionTypes() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['expedition_types'],
    enabled: Boolean(userId),
    queryFn: async (): Promise<ExpeditionTypeRow[]> => {
      const { data, error } = await supabase
        .from('expedition_types')
        .select('id, name, min_level_required, min_power_required, duration_base_seconds, loot_table')
        .order('min_level_required', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ExpeditionTypeRow[];
    },
  });
}

/** Expéditions en cours du joueur (RLS : ses propres runs). */
export function useActiveExpeditions() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['expedition_runs', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<ExpeditionRunRow[]> => {
      const { data, error } = await supabase
        .from('expedition_runs')
        .select('id, expedition_type_id, hero_ids, started_at, ends_at, status')
        .eq('status', 'in_progress')
        .order('ends_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ExpeditionRunRow[];
    },
  });
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('resolve-expedition', { body });
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

export function useExpeditionActions() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['expedition_runs', userId] });
    void queryClient.invalidateQueries({ queryKey: ['resources', userId] });
    void queryClient.invalidateQueries({ queryKey: ['profile', userId] });
    void queryClient.invalidateQueries({ queryKey: heroesQueryKey(userId) });
  };

  const start = useMutation({
    mutationFn: (args: { expeditionTypeId: string; heroIds: string[] }) =>
      invoke<{ run: ExpeditionRunRow }>({
        action: 'start',
        expedition_type_id: args.expeditionTypeId,
        hero_ids: args.heroIds,
      }),
    onSuccess: refresh,
  });

  const claim = useMutation({
    mutationFn: (runId: string) => invoke<{ rewards: ExpeditionRewards }>({ action: 'claim', run_id: runId }),
    onSuccess: refresh,
  });

  const cancel = useMutation({
    mutationFn: (runId: string) => invoke<{ cancelled: boolean }>({ action: 'cancel', run_id: runId }),
    onSuccess: refresh,
  });

  return { start, claim, cancel };
}
