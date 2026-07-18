import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import type { CombatEvent, CombatantFinalState } from '@shared/combat';

// arena_ladder n'est pas dans les types générés → client permissif.
const adb = supabase as unknown as SupabaseClient;

export type LadderRow = {
  player_id: string;
  rank: number;
  display_name: string;
  power: number;
  wins: number;
  losses: number;
  team_hero_ids: string[];
};

/** Échelle de l'arène (vue publique), triée par rang. */
export function useArenaLadder() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['arena', 'ladder'],
    enabled: Boolean(userId),
    queryFn: async (): Promise<LadderRow[]> => {
      const { data } = await adb
        .from('arena_ladder')
        .select('player_id, rank, display_name, power, wins, losses, team_hero_ids')
        .order('rank', { ascending: true })
        .limit(100);
      return ((data ?? []) as unknown as LadderRow[]).map((r) => ({
        player_id: r.player_id,
        rank: r.rank ?? 0,
        display_name: r.display_name ?? 'Joueur',
        power: r.power ?? 0,
        wins: r.wins ?? 0,
        losses: r.losses ?? 0,
        team_hero_ids: (r.team_hero_ids ?? []) as string[],
      }));
    },
  });
}

export type ArenaCombat = {
  result: 'win' | 'loss';
  rounds: number;
  events: CombatEvent[];
  final_state: CombatantFinalState[];
};

export type ChallengeResult = { result: 'win' | 'loss'; win: boolean; new_rank: number; combat: ArenaCombat };
export type ClaimResult = {
  ok: boolean;
  reward: { gold: number; materials: { key: string; qty: number }[] };
  rank: number;
  participants: number;
  /** Semaine ISO récompensée (toujours une semaine ÉCOULÉE, jamais celle en cours). */
  week: string;
  /** Zone de référence du butin = zone du 1er du classement, +1. */
  zone: number;
};

async function invokeArena<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('arena', { body });
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

export function useArenaActions() {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['arena'] });
    void qc.invalidateQueries({ queryKey: ['resources', userId] });
    void qc.invalidateQueries({ queryKey: ['profile', userId] });
  };

  const setTeam = useMutation({
    mutationFn: (heroIds: string[]) => invokeArena<{ ok: boolean }>({ action: 'set_team', hero_ids: heroIds }),
    onSuccess: invalidate,
  });
  const challenge = useMutation({
    mutationFn: (defenderId: string) =>
      invokeArena<ChallengeResult>({ action: 'challenge', defender_player_id: defenderId }),
    onSuccess: invalidate,
  });
  const claimWeekly = useMutation({
    mutationFn: () => invokeArena<ClaimResult>({ action: 'claim_weekly' }),
    onSuccess: invalidate,
  });

  return { setTeam, challenge, claimWeekly };
}
