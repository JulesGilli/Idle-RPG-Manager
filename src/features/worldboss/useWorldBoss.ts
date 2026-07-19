import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import type { CombatEvent, CombatantFinalState } from '@shared/combat';

/* ------------------------------------------------------------------ TYPES */

export type WorldBossReward = { gold?: number; tears?: number };
export type WorldBossTierDef = { idx: number; threshold: number; reward: WorldBossReward };
export type WorldBossLeader = { rank: number; player_id: string; name: string; damage: number };
export type WorldBossTitle = { title: string; stat_mult: number; expires_at: string };

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
  claimed_tiers?: number[];
  my_title?: WorldBossTitle | null;
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

export function useWorldBoss() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  const state = useQuery({
    queryKey: worldBossQueryKey(userId),
    enabled: Boolean(userId),
    queryFn: () => invoke<WorldBossState>({ action: 'state' }),
    // Event communautaire (dégâts partagés) → resynchro régulière. 2 min suffisent
    // (le total ne bouge que par frappes ponctuelles) et divisent l'egress par 4 ;
    // chaque frappe/claim invalide de toute façon la query immédiatement.
    refetchInterval: 120_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: worldBossQueryKey(userId) });
    // Le crédit d'or / la frappe touchent le profil.
    void queryClient.invalidateQueries({ queryKey: ['profile'] });
  };

  const hit = useMutation({
    mutationFn: (heroIds: string[]) => invoke<WorldBossHitResponse>({ action: 'hit', hero_ids: heroIds }),
    onSuccess: invalidate,
  });

  const claim = useMutation({
    mutationFn: () => invoke<WorldBossClaimResponse>({ action: 'claim' }),
    onSuccess: invalidate,
  });

  return { state, hit, claim };
}
