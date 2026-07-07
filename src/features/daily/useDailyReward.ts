import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import { dailyStatus, type DailyClaimState, type DailyStatus } from '@shared/progression/daily';

// daily_claims n'est pas dans les types générés → client permissif pour la lecture.
const ddb = supabase as unknown as SupabaseClient;

/** Date du jour 'YYYY-MM-DD' au fuseau Europe/Paris (même règle que le serveur). */
function parisToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export type DailyView = DailyStatus & { dayIndex: number; today: string };

/** État de la récompense journalière du joueur (lecture RLS own + logique partagée). */
export function useDailyReward() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['daily', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<DailyView> => {
      const { data } = await ddb
        .from('daily_claims')
        .select('last_claim_date, day_index')
        .eq('player_id', userId!)
        .maybeSingle();
      const state: DailyClaimState = {
        lastClaimDate: (data?.last_claim_date as string | null) ?? null,
        dayIndex: (data?.day_index as number | null) ?? 0,
      };
      const today = parisToday();
      return { ...dailyStatus(state, today), dayIndex: state.dayIndex, today };
    },
  });
}

export type ClaimedItem = { name: string; item_type: string; rarity: string } | null;
export type ClaimResult = {
  ok: boolean;
  day: number;
  materials: { key: string; qty: number }[];
  item: ClaimedItem;
};

/** Réclame la récompense du jour (validée serveur). */
export function useClaimDaily() {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  return useMutation({
    mutationFn: async (): Promise<ClaimResult> => {
      const { data, error } = await supabase.functions.invoke<ClaimResult>('daily-reward', {
        body: {},
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
      void qc.invalidateQueries({ queryKey: ['daily', userId] });
      void qc.invalidateQueries({ queryKey: ['resources', userId] });
      void qc.invalidateQueries({ queryKey: ['items', userId] });
    },
  });
}
