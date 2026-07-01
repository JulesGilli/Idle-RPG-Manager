import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import { heroesQueryKey } from './useHeroes';

export type ItemRow = {
  id: string;
  name: string;
  item_type: string;
  rarity: string;
  atk_bonus: number;
  def_bonus: number;
  hp_bonus: number;
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
        .select('id, name, item_type, rarity, atk_bonus, def_bonus, hp_bonus')
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
