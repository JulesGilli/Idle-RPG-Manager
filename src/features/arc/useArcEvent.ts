import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import type { CombatEvent, CombatantFinalState } from '@shared/combat';

/* ------------------------------------------------------------------ TYPES */

export type ArcEventStatus = 'pending' | 'active' | 'defeated' | 'expired';

export type ArcEvent = {
  id: string;
  status: ArcEventStatus;
  boss_name: string;
  hp_max: number;
  hp_current: number;
  eligible_count: number;
  summoned_at: string;
  invoke_at: string;
  deadline: string;
  defeated_at: string | null;
  ended_at: string | null;
  /** 1 = le boss ; 2 = les cœurs de démon révélés par sa chute. */
  phase: 1 | 2;
  phase2_at: string | null;
  hearts_total: number;
  /** PV d'UN cœur (le pool de la phase 2 en vaut `hearts_total`). */
  heart_hp: number;
  hearts_remaining: number;
};

export type ArcEventLeader = {
  player_id: string;
  name: string;
  damage: number;
};

export type ArcEventState = {
  event: ArcEvent | null;
  eligible: boolean;
  eligible_count: number;
  can_summon: boolean;
  can_hit_now: boolean;
  next_hit_at: string | null;
  arc2_open: boolean;
  leaderboard: ArcEventLeader[];
};

/** Combat renvoyé par `hit` — déjà en forme StoredCombat (snake_case final_state). */
export type ArcEventCombat = {
  rounds: number;
  result: 'win' | 'loss';
  events: CombatEvent[];
  final_state: CombatantFinalState[];
};

export type ArcEventHitResponse = {
  combat: ArcEventCombat;
  damage: number;
  hp_current: number;
  hp_max: number;
  /** L'Être est MORT (cœurs compris) : l'arc s'ouvre. */
  defeated: boolean;
  /** Phase effectivement frappée. */
  phase: 1 | 2;
  /** Phase en cours après la frappe. */
  next_phase: 1 | 2;
  /** Cette frappe a mis le boss à terre et révélé les cœurs. */
  boss_down: boolean;
  hearts_remaining: number;
};

/* ------------------------------------------------------------------ INVOKE */

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('arc-event', { body });
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

export const arcEventQueryKey = (userId: string | undefined) => ['arc_event', userId] as const;

export function useArcEvent() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  const state = useQuery({
    queryKey: arcEventQueryKey(userId),
    enabled: Boolean(userId),
    queryFn: () => invoke<ArcEventState>({ action: 'state' }),
    // L'event est communautaire (PV partagés) → resynchro régulière. 2 min
    // suffisent : chaque action (summon/frappe) invalide la query immédiatement.
    refetchInterval: 120_000,
  });

  const invalidate = (fresh?: ArcEventState) => {
    if (fresh) queryClient.setQueryData(arcEventQueryKey(userId), fresh);
    void queryClient.invalidateQueries({ queryKey: arcEventQueryKey(userId) });
    void queryClient.invalidateQueries({ queryKey: ['player_arc'] });
  };

  const summon = useMutation({
    mutationFn: () => invoke<ArcEventState>({ action: 'summon' }),
    onSuccess: (fresh) => invalidate(fresh),
  });

  const hit = useMutation({
    mutationFn: (heroIds: string[]) =>
      invoke<ArcEventHitResponse>({ action: 'hit', hero_ids: heroIds }),
    onSuccess: () => invalidate(),
  });

  return { state, summon, hit };
}
