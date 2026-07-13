import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import type { AchievementStats } from '@shared/progression/achievements';

async function invokeTitles<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('titles', { body });
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

export type TitlesStatus = { unlocked: string[]; title: string | null; stats: AchievementStats };

export const titlesQueryKey = (userId: string | undefined) => ['titles', userId] as const;

export function useTitlesStatus() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: titlesQueryKey(userId),
    enabled: Boolean(userId),
    queryFn: () => invokeTitles<TitlesStatus>({ action: 'status' }),
  });
}

export function useEquipTitle() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  return useMutation({
    mutationFn: (title: string | null) => invokeTitles<{ ok: boolean; title: string | null }>({ action: 'equip', title }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: titlesQueryKey(userId) });
      void queryClient.invalidateQueries({ queryKey: ['profile', userId] });
    },
  });
}
