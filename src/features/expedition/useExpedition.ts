import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import type { Accrual } from '@shared/progression/idle';
import type { ItemDrop } from '@shared/progression/loot';

export type ExpeditionRow = {
  player_id: string;
  dungeon_id: string;
  hero_ids: string[];
  started_at: string;
  last_claimed_at: string;
};

export type ExpeditionStatus = {
  expedition: ExpeditionRow | null;
  dungeon_name?: string;
  preview?: Accrual;
};

export type ClaimResult = {
  expedition: ExpeditionRow;
  dungeon_name: string;
  rewards: {
    gold: number;
    xp_per_hero: number;
    adventures: number;
    capped: boolean;
    items: ItemDrop[];
    level_ups: { hero_id: string; levels: number }[];
  };
  feed: string[];
};

type Action =
  | { action: 'status' }
  | { action: 'stop' }
  | { action: 'claim' }
  | {
      action: 'start';
      dungeon_id: string;
      hero_ids: string[];
    };

async function invoke<T>(body: Action): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('resolve-expedition', { body });
  if (error) throw error;
  if (!data) throw new Error('Réponse vide du serveur');
  return data;
}

export const expeditionQueryKey = (userId: string | undefined) => ['expedition', userId] as const;

export function useExpedition() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  const status = useQuery({
    queryKey: expeditionQueryKey(userId),
    enabled: Boolean(userId),
    queryFn: () => invoke<ExpeditionStatus>({ action: 'status' }),
  });

  const invalidateStatus = () =>
    void queryClient.invalidateQueries({ queryKey: expeditionQueryKey(userId) });

  const start = useMutation({
    mutationFn: (args: { dungeonId: string; heroIds: string[] }) =>
      invoke<ExpeditionStatus>({
        action: 'start',
        dungeon_id: args.dungeonId,
        hero_ids: args.heroIds,
      }),
    onSuccess: invalidateStatus,
  });

  const stop = useMutation({
    mutationFn: () => invoke<ExpeditionStatus>({ action: 'stop' }),
    onSuccess: invalidateStatus,
  });

  const claim = useMutation({
    mutationFn: () => invoke<ClaimResult>({ action: 'claim' }),
    onSuccess: () => {
      invalidateStatus();
      void queryClient.invalidateQueries({ queryKey: ['profile', userId] });
      void queryClient.invalidateQueries({ queryKey: ['heroes', userId] });
      void queryClient.invalidateQueries({ queryKey: ['items', userId] });
      void queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
    },
  });

  return { status, start, stop, claim };
}
