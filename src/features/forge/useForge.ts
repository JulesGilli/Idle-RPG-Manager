import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';

async function invokeForge<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('forge', { body });
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

export type UpgradeResult = { success: boolean; upgrade_level: number };

export function useForge() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['items', userId] });
    void queryClient.invalidateQueries({ queryKey: ['profile', userId] });
    void queryClient.invalidateQueries({ queryKey: ['resources', userId] });
    void queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
  };

  const craft = useMutation({
    mutationFn: (args: { itemType: 'weapon' | 'armor'; recipeId: string }) =>
      invokeForge<{ item: unknown }>({
        action: 'craft',
        item_type: args.itemType,
        recipe_id: args.recipeId,
      }),
    onSuccess: invalidate,
  });

  const upgrade = useMutation({
    mutationFn: (itemId: string) =>
      invokeForge<UpgradeResult>({ action: 'upgrade', item_id: itemId }),
    onSuccess: invalidate,
  });

  return { craft, upgrade };
}
