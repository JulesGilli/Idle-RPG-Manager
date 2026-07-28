import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import type { StoredCombat } from '@/components/CombatReplay';

// pantheon_ladder n'est pas dans les types générés → client permissif.
const adb = supabase as unknown as SupabaseClient;

export type PantheonState = {
  unlocked: boolean;
  min_arc: number;
  teams_required: number;
  team_size: number;
  roster_required: number;
  heroes_count: number;
  in_pantheon: boolean;
  rank: number | null;
  power: number;
  wins: number;
  losses: number;
  /** 5 équipes de 3 ids (vide si jamais déposées). */
  teams: string[][];
};

export type PantheonLadderRow = {
  player_id: string;
  rank: number;
  display_name: string;
  power: number;
  wins: number;
  losses: number;
};

export type PantheonMatch = { index: number; win: boolean; combat: StoredCombat };
export type PantheonChallengeResult = {
  win: boolean;
  score: { attacker: number; defender: number };
  new_rank: number;
  matches: PantheonMatch[];
};

async function invokePantheon<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('pantheon', { body });
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

export const pantheonStateKey = (userId: string | undefined) => ['pantheon', 'state', userId] as const;

export function usePantheonState() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: pantheonStateKey(userId),
    enabled: Boolean(userId),
    queryFn: () => invokePantheon<PantheonState>({ action: 'state' }),
  });
}

export function usePantheonLadder() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['pantheon', 'ladder'],
    enabled: Boolean(userId),
    queryFn: async (): Promise<PantheonLadderRow[]> => {
      const { data } = await adb
        .from('pantheon_ladder')
        .select('player_id, rank, display_name, power, wins, losses')
        .order('rank', { ascending: true })
        .limit(100);
      return ((data ?? []) as unknown as PantheonLadderRow[]).map((r) => ({
        player_id: r.player_id,
        rank: r.rank ?? 0,
        display_name: r.display_name ?? 'Joueur',
        power: r.power ?? 0,
        wins: r.wins ?? 0,
        losses: r.losses ?? 0,
      }));
    },
  });
}

export function usePantheonActions() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['pantheon'] });
  };

  const setTeams = useMutation({
    mutationFn: (teams: string[][]) => invokePantheon<{ ok: boolean }>({ action: 'set_teams', teams }),
    onSuccess: invalidate,
  });
  const challenge = useMutation({
    mutationFn: (defenderId: string) =>
      invokePantheon<PantheonChallengeResult>({ action: 'challenge', defender_player_id: defenderId }),
    onSuccess: invalidate,
  });

  return { setTeams, challenge };
}
