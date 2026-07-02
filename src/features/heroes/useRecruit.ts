import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import type { Grade, RecruitBonuses } from '@shared/progression/recruit';
import { heroesQueryKey } from './useHeroes';

export type RecruitedHero = {
  id: string;
  name: string;
  class_id: string;
  bonus_hp: number;
  bonus_atk: number;
  bonus_def: number;
  bonus_speed: number;
};

export type TavernCandidate = {
  slot: number;
  class_id: string;
  class_name: string;
  name: string;
  grade: Grade;
  bonuses: RecruitBonuses;
  stats: { hp: number; atk: number; def: number; speed: number };
  claimed: boolean;
};

export type TavernPool = {
  day: string;
  candidates: TavernCandidate[];
  cost: number;
  roster_size: number;
  max_roster: number;
};

async function invokeRecruit<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('recruit', { body });
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

export const tavernQueryKey = (userId: string | undefined) => ['tavern', userId] as const;

export function useTavernPool() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: tavernQueryKey(userId),
    enabled: Boolean(userId),
    queryFn: () => invokeRecruit<TavernPool>({ action: 'pool' }),
    staleTime: 60_000,
  });
}

export function useRecruit() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: heroesQueryKey(userId) });
    void queryClient.invalidateQueries({ queryKey: tavernQueryKey(userId) });
    void queryClient.invalidateQueries({ queryKey: ['profile', userId] });
    void queryClient.invalidateQueries({ queryKey: ['deployments', userId] });
    void queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
  };

  const recruit = useMutation({
    mutationFn: (slot: number) =>
      invokeRecruit<{ hero: RecruitedHero; cost: number }>({ action: 'recruit', slot }),
    onSuccess: invalidate,
  });

  const dismiss = useMutation({
    mutationFn: (heroId: string) =>
      invokeRecruit<{ ok: true }>({ action: 'dismiss', hero_id: heroId }),
    onSuccess: invalidate,
  });

  return { recruit, dismiss };
}
