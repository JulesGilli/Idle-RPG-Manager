import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import type { RedeemReward } from '@shared/progression/redeem';

// redeem_claims n'est pas dans les types générés → client permissif pour la lecture.
const rdb = supabase as unknown as SupabaseClient;

export type RedeemClaim = { code: string; granted: RedeemReward; created_at: string };

/** Codes déjà réclamés par le joueur (historique). */
export function useMyRedeems() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['redeems', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<RedeemClaim[]> => {
      const { data } = await rdb
        .from('redeem_claims')
        .select('code, granted, created_at')
        .eq('player_id', userId!)
        .order('created_at', { ascending: false });
      return ((data ?? []) as unknown as RedeemClaim[]).map((c) => ({
        code: c.code,
        granted: (c.granted ?? {}) as RedeemReward,
        created_at: c.created_at,
      }));
    },
  });
}

export type RedeemResult = {
  ok: boolean;
  reward: RedeemReward;
  item: { name: string; item_type: string; rarity: string } | null;
};

/** Réclame un code (validé serveur). */
export function useRedeemCode() {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  return useMutation({
    mutationFn: async (code: string): Promise<RedeemResult> => {
      const { data, error } = await supabase.functions.invoke<RedeemResult>('redeem-code', {
        body: { code },
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
      if (!data) throw new Error('Réponse vide du serveur');
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['redeems', userId] });
      void qc.invalidateQueries({ queryKey: ['resources', userId] });
      void qc.invalidateQueries({ queryKey: ['items', userId] });
      void qc.invalidateQueries({ queryKey: ['profile', userId] });
    },
  });
}
