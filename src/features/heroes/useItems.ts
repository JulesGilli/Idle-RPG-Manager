import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import { heroesQueryKey } from './useHeroes';

export type ItemRow = {
  id: string;
  name: string;
  item_type: string;
  rarity: string;
  weight: string | null;
  locked: boolean;
  tier: number;
  upgrade_level: number;
  /** Échecs consécutifs sur cet objet — bonifient la prochaine tentative (acharnement). */
  upgrade_fails: number;
  blessing_level: number;
  atk_bonus: number;
  def_bonus: number;
  hp_bonus: number;
  passive_type: string | null;
  passive_value: number;
  base_passive_value: number;
  set_id: string | null;
};

export const itemsQueryKey = (userId: string | undefined) => ['items', userId] as const;

export function useItems() {
  const userId = useAuthStore((s) => s.user?.id);

  return useQuery({
    queryKey: itemsQueryKey(userId),
    enabled: Boolean(userId),
    queryFn: async (): Promise<ItemRow[]> => {
      const { data, error } = await supabase
        .from('items')
        .select(
          'id, name, item_type, rarity, weight, locked, tier, upgrade_level, upgrade_fails, blessing_level, atk_bonus, def_bonus, hp_bonus, passive_type, passive_value, base_passive_value, set_id',
        )
        .eq('owner_id', userId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useEquip() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: heroesQueryKey(userId) });
    void queryClient.invalidateQueries({ queryKey: itemsQueryKey(userId) });
    void queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
  };

  const equip = useMutation({
    mutationFn: async (args: {
      heroId: string;
      itemId: string;
      slot: 'weapon' | 'armor' | 'jewel' | 'relic';
    }) => {
      const { error } = await supabase.rpc('equip_item', {
        p_hero_id: args.heroId,
        p_item_id: args.itemId,
        p_slot: args.slot,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const unequip = useMutation({
    mutationFn: async (args: { heroId: string; slot: 'weapon' | 'armor' | 'jewel' | 'relic' }) => {
      const { error } = await supabase.rpc('unequip_item', {
        p_hero_id: args.heroId,
        p_slot: args.slot,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { equip, unequip };
}

/** Résultat d'un recyclage : objets détruits + matériaux rendus (clé → quantité). */
export type SalvageResult = {
  deleted: number;
  refunded: Record<string, number>;
};

export function useDeleteItems() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  return useMutation({
    // Passe par la fonction edge et non plus par le RPC SQL : le remboursement
    // s'appuie sur les recettes, qui vivent en TypeScript.
    mutationFn: async (itemIds: string[]): Promise<SalvageResult> => {
      const { data, error } = await supabase.functions.invoke<SalvageResult>('forge', {
        body: { action: 'salvage', item_ids: itemIds },
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
      return data ?? { deleted: 0, refunded: {} };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: itemsQueryKey(userId) });
      void queryClient.invalidateQueries({ queryKey: heroesQueryKey(userId) });
      // Le recyclage crédite des matériaux : la réserve doit se rafraîchir.
      void queryClient.invalidateQueries({ queryKey: ['resources'] });
      void queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
    },
  });
}

export function useSetItemLock() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  return useMutation({
    mutationFn: async (args: { itemIds: string[]; locked: boolean }) => {
      const { error } = await supabase.rpc('set_item_lock', {
        p_item_ids: args.itemIds,
        p_locked: args.locked,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: itemsQueryKey(userId) });
    },
  });
}
