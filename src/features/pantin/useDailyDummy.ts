import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import type { CombatEvent, CombatantFinalState, CombatResultKind } from '@shared/combat/types';

async function invokeDummy<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('daily-dummy', { body });
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

export type DummyStatus = { done_today: boolean; best_score: number; rounds: number };

export type DummyRunResult = {
  score: number;
  best_score: number;
  reward: { gold: number };
  combat: {
    rounds: number;
    events: CombatEvent[];
    final_state: CombatantFinalState[];
    result: CombatResultKind;
  };
};

export function useDummyStatus() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['pantin-status', userId],
    enabled: Boolean(userId),
    queryFn: () => invokeDummy<DummyStatus>({ action: 'status' }),
  });
}

export function useRunDummy() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  return useMutation({
    mutationFn: (heroIds: string[]) => invokeDummy<DummyRunResult>({ action: 'run', hero_ids: heroIds }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pantin-status', userId] });
      void queryClient.invalidateQueries({ queryKey: ['profile', userId] });
      // Un nouveau record fait bouger le classement : sans ça le joueur venait
      // de battre son score et voyait encore l'ancien rang.
      void queryClient.invalidateQueries({ queryKey: ['pantin-leaderboard'] });
    },
  });
}

export type PantinRankRow = {
  player_id: string;
  display_name: string | null;
  title: string | null;
  best_score: number;
  rank: number;
};

const TOP_N = 10;

/**
 * Top 10 all-time + la ligne du joueur s'il n'y figure pas.
 *
 * Lecture directe de la vue `pantin_leaderboard` (pas d'Edge Function) : la vue
 * est en `security_invoker = false`, elle traverse donc la RLS « select own » de
 * `pantin_runs`. Le rang est calculé côté SQL, ce qui évite de rapatrier tout le
 * classement juste pour compter les joueurs devant soi.
 */
export function usePantinLeaderboard() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['pantin-leaderboard', userId],
    enabled: Boolean(userId),
    staleTime: 60_000,
    queryFn: async (): Promise<{ top: PantinRankRow[]; me: PantinRankRow | null }> => {
      // La vue n'est pas dans les types générés → client permissif, comme
      // `useLeaderboard` le fait déjà pour `leaderboard`.
      const pdb = supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            order: (c: string, o: { ascending: boolean }) => {
              limit: (n: number) => Promise<{ data: PantinRankRow[] | null }>;
            };
            eq: (c: string, v: string) => {
              maybeSingle: () => Promise<{ data: PantinRankRow | null }>;
            };
          };
        };
      };
      const cols = 'player_id, display_name, title, best_score, rank';
      const { data: top } = await pdb
        .from('pantin_leaderboard')
        .select(cols)
        .order('rank', { ascending: true })
        .limit(TOP_N);
      const rows = top ?? [];
      if (!userId || rows.some((r) => r.player_id === userId)) return { top: rows, me: null };
      const { data: me } = await pdb.from('pantin_leaderboard').select(cols).eq('player_id', userId).maybeSingle();
      return { top: rows, me: me ?? null };
    },
  });
}
