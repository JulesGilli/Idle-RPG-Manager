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
export type RefineResult = { success: boolean; upgrade_level: number; passive_value: number };

export type CraftedItem = {
  id: string;
  name: string;
  rarity: string;
  item_type: string;
  tier: number;
  atk_bonus: number;
  def_bonus: number;
  hp_bonus: number;
  passive_type: string | null;
  passive_value: number;
};

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
    mutationFn: (args: { baseId: string; materialId: string }) =>
      invokeForge<{ item: CraftedItem }>({
        action: 'craft',
        base_id: args.baseId,
        material_id: args.materialId,
      }),
    onSuccess: invalidate,
  });

  const craftJewel = useMutation({
    mutationFn: (args: { materialId: string; gemId: string }) =>
      invokeForge<{ item: CraftedItem }>({
        action: 'craft_jewel',
        material_id: args.materialId,
        gem_id: args.gemId,
      }),
    onSuccess: invalidate,
  });

  const craftRelic = useMutation({
    mutationFn: (args: { baseId: string; materialId: string }) =>
      invokeForge<{ item: CraftedItem }>({
        action: 'craft_relic',
        base_id: args.baseId,
        material_id: args.materialId,
      }),
    onSuccess: invalidate,
  });

  const upgrade = useMutation({
    mutationFn: (itemId: string) =>
      invokeForge<UpgradeResult>({ action: 'upgrade', item_id: itemId }),
    onSuccess: invalidate,
  });

  const refineJewel = useMutation({
    mutationFn: (itemId: string) =>
      invokeForge<RefineResult>({ action: 'refine_jewel', item_id: itemId }),
    onSuccess: invalidate,
  });

  const craftSet = useMutation({
    mutationFn: (args: { pieceId: string }) =>
      invokeForge<{ item: CraftedItem }>({ action: 'craft_set', piece_id: args.pieceId }),
    onSuccess: invalidate,
  });

  return { craft, craftJewel, craftRelic, upgrade, refineJewel, craftSet };
}
