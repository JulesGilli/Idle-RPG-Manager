import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';

export type Resources = Record<string, number>;

export const RESOURCE_META: Record<string, { label: string; icon: string }> = {
  iron: { label: 'Fer', icon: '⛏️' },
  essence: { label: 'Essence', icon: '🔷' },
};

export function useResources() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['resources', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Resources> => {
      const { data, error } = await supabase
        .from('player_resources')
        .select('resource, amount')
        .eq('player_id', userId!);
      if (error) throw error;
      const out: Resources = {};
      for (const r of data ?? []) out[r.resource] = r.amount;
      return out;
    },
  });
}
