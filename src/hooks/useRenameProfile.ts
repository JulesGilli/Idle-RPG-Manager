import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';

/**
 * Change le pseudo du joueur. Le plafond (2 changements max) est appliqué côté DB
 * par un trigger (migration 0061) : une erreur remonte si la limite est atteinte
 * ou le pseudo invalide. On rafraîchit le profil + tout ce qui affiche un pseudo.
 */
export function useRenameProfile() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  return useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: name.trim() })
        .eq('id', userId!);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profile', userId] });
      void queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
      void queryClient.invalidateQueries({ queryKey: ['guild'] });
    },
  });
}
