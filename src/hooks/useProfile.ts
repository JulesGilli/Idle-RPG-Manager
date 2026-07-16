import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';

export function useProfile() {
  const userId = useAuthStore((s) => s.user?.id);

  return useQuery({
    queryKey: ['profile', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, gold, account_xp, created_at, last_seen_at, has_lost, name_changes, pseudo_chosen, tuto_done, expedition_xp, forge_xp, jewel_xp')
        .eq('id', userId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}
