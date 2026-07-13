import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import type { CombatEvent, CombatantFinalState, CombatResultKind } from '@shared/combat/types';

async function invokeDummy<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('daily-dummy', { body });
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

export type DummyStatus = { done_today: boolean; best_score: number; rounds: number };

export type DummyRunResult = {
  score: number;
  best_score: number;
  reward: { gold: number };
  combat: {
    rounds: number;
    events: CombatEvent[];
    final_state: CombatantFinalState[];
    result: CombatResultKind;
  };
};

export function useDummyStatus() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['pantin-status', userId],
    enabled: Boolean(userId),
    queryFn: () => invokeDummy<DummyStatus>({ action: 'status' }),
  });
}

export function useRunDummy() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  return useMutation({
    mutationFn: (heroIds: string[]) => invokeDummy<DummyRunResult>({ action: 'run', hero_ids: heroIds }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pantin-status', userId] });
      void queryClient.invalidateQueries({ queryKey: ['profile', userId] });
    },
  });
}
