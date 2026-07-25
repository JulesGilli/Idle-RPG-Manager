import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import type { CombatEvent, CombatantFinalState } from '@shared/combat';

/* ------------------------------------------------------------------ TYPES */

export type WorldBossReward = { gold?: number; tears?: number };
export type WorldBossTierDef = { idx: number; threshold: number; reward: WorldBossReward };
export type WorldBossLeader = { rank: number; player_id: string; name: string; damage: number };
export type WorldBossTitle = { title: string; stat_mult: number; expires_at: string };

/** Récompense de classement d'UNE semaine, en attente de réclamation. */
export type RankRewardRow = {
  event_id: string;
  week_key: string;
  boss_name: string;
  rank: number;
  gold: number;
  tears: number;
  eclat: number;
};

export type RankRewardsPending = {
  count: number;
  gold: number;
  tears: number;
  eclat: number;
  rows: RankRewardRow[];
};

export type WorldBossState = {
  active: boolean;
  boss_name?: string;
  total_damage?: number;
  tiers: WorldBossTierDef[];
  tiers_unlocked?: number;
  hittable?: boolean;
  weekday?: boolean;
  already_hit_today?: boolean;
  my_damage?: number;
  my_today_damage?: number;
  claimable_gold?: number;
  claimable_tears?: number;
  /** Récompenses de CLASSEMENT en attente (finalisation du week-end) — pilote la
   *  gommette rouge et le bouton de réclamation. */
  rank_rewards_pending?: RankRewardsPending;
  my_title?: WorldBossTitle | null;
  /** Samedi (boss tombé) : nom du boss de la semaine qui vient de s'achever. */
  last_boss_name?: string | null;
  ends_at?: string;
  leaderboard?: WorldBossLeader[];
  server_now?: string;
};

export type WorldBossCombat = {
  rounds: number;
  result: 'win' | 'loss';
  events: CombatEvent[];
  final_state: CombatantFinalState[];
};

export type WorldBossHitResponse = {
  combat: WorldBossCombat;
  damage: number;
  total_damage: number;
  tiers_unlocked: number;
};

export type WorldBossClaimResponse = { gold: number; tears: number; claimed: number[] };
export type WorldBossClaimRankResponse = {
  gold: number;
  tears: number;
  eclat: number;
  claimed: RankRewardRow[];
};

/* ------------------------------------------------------------------ INVOKE */

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('world-boss', { body });
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

/* ------------------------------------------------------------------ HOOK */

export const worldBossQueryKey = (userId: string | undefined) => ['world_boss', userId] as const;

/**
 * @param pollMs cadence de resynchro. Par défaut 2 min, pour l'ÉCRAN du boss.
 *   Les appelants qui n'ont besoin que d'un signal « il reste une frappe »
 *   (gommette du hub) passent une cadence bien plus lente : ce hook serait
 *   sinon monté en permanence via `AppLayout` et quadruplerait l'egress.
 *   React Query retient la cadence la PLUS COURTE parmi les observateurs actifs
 *   — l'écran du boss garde donc ses 2 min quand il est ouvert.
 */
export function useWorldBoss(pollMs: number = 120_000) {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  const state = useQuery({
    queryKey: worldBossQueryKey(userId),
    enabled: Boolean(userId),
    queryFn: () => invoke<WorldBossState>({ action: 'state' }),
    refetchInterval: pollMs,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: worldBossQueryKey(userId) });
    // Le crédit d'or / la frappe touchent le profil ; les larmes et l'Éclat sacré
    // touchent les ressources.
    void queryClient.invalidateQueries({ queryKey: ['profile'] });
    void queryClient.invalidateQueries({ queryKey: ['resources', userId] });
  };

  const hit = useMutation({
    mutationFn: (heroIds: string[]) => invoke<WorldBossHitResponse>({ action: 'hit', hero_ids: heroIds }),
    onSuccess: invalidate,
  });

  const claim = useMutation({
    mutationFn: () => invoke<WorldBossClaimResponse>({ action: 'claim' }),
    onSuccess: invalidate,
  });

  // Récompenses de CLASSEMENT (fin de semaine) : or + larmes + Éclat sacré.
  const claimRank = useMutation({
    mutationFn: () => invoke<WorldBossClaimRankResponse>({ action: 'claim_rank' }),
    onSuccess: invalidate,
  });

  return { state, hit, claim, claimRank };
}
