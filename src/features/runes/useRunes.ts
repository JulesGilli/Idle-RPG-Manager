import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import { heroesQueryKey } from '@/features/heroes/useHeroes';

async function invokeRunes<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('runes', { body });
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

export type RuneRow = { id: string; set_id: string };

export const runesQueryKey = (userId: string | undefined) => ['runes', userId] as const;

export function useRunes() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: runesQueryKey(userId),
    enabled: Boolean(userId),
    queryFn: async (): Promise<RuneRow[]> => {
      const { data, error } = await supabase.from('runes').select('id, set_id').eq('owner_id', userId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRuneActions() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: runesQueryKey(userId) });
    void queryClient.invalidateQueries({ queryKey: heroesQueryKey(userId) });
    void queryClient.invalidateQueries({ queryKey: ['items', userId] });
    void queryClient.invalidateQueries({ queryKey: ['profile', userId] });
    void queryClient.invalidateQueries({ queryKey: ['resources', userId] });
  };

  const awaken = useMutation({
    mutationFn: (heroId: string) => invokeRunes<{ ok: boolean }>({ action: 'awaken', hero_id: heroId }),
    onSuccess: invalidate,
  });
  const craft = useMutation({
    mutationFn: (setId: string) => invokeRunes<{ ok: boolean; rune: RuneRow }>({ action: 'craft', set_id: setId }),
    onSuccess: invalidate,
  });
  const equip = useMutation({
    mutationFn: (args: { heroId: string; runeId: string | null }) =>
      invokeRunes<{ ok: boolean }>({ action: 'equip', hero_id: args.heroId, rune_id: args.runeId }),
    onSuccess: invalidate,
  });

  return { awaken, craft, equip };
}
