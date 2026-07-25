import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import type { CombatEvent, CombatantFinalState } from '@shared/combat';

/* ------------------------------------------------------------------ TYPES */

/** Combat d'une vague tel que renvoyé par l'Edge Function. */
export type GauntletCombat = {
  result: 'win' | 'loss';
  rounds: number;
  events: CombatEvent[];
  finalState: CombatantFinalState[];
};

export type GauntletWaveResult = {
  wave: number;
  isBoss: boolean;
  combat: GauntletCombat;
};

export type GauntletState = {
  best_wave: number;
  /** Éclat d'Éternité produit par jour au record actuel. */
  per_day: number;
  /** Éclat en attente d'encaissement (produit depuis le dernier claim). */
  pending: number;
  last_claim_at: string;
};

export type GauntletRunResponse = {
  run_id: string | null;
  seed: number;
  reached_wave: number;
  cleared_new: number;
  best_wave: number;
  per_day: number;
  /** Éclat encaissé automatiquement au passage (règlement de la rente). */
  banked_eternity: number;
  wave_results: GauntletWaveResult[];
};

/* ---------------------------------------------------------------- INVOKE */

async function invokeGauntlet<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('gauntlet', { body });
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

/* ----------------------------------------------------------------- QUERY */

/** Progression du Gauntlet + rente d'Éclat (record, production/jour, en attente). */
export function useGauntletState() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['gauntlet_state', userId],
    enabled: Boolean(userId),
    // La rente en attente s'accumule dans le temps → on rafraîchit périodiquement.
    refetchInterval: 60_000,
    queryFn: () => invokeGauntlet<GauntletState>({ action: 'state' }),
  });
}

/* -------------------------------------------------------------- MUTATIONS */

/** Encaisse l'Éclat d'Éternité produit depuis le dernier encaissement. */
export function useClaimEternity() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  return useMutation({
    mutationFn: () => invokeGauntlet<{ credited: number; best_wave: number; per_day: number }>({ action: 'claim' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['resources', userId] });
      void queryClient.invalidateQueries({ queryKey: ['gauntlet_state', userId] });
    },
  });
}

/** Lance une course de Gauntlet avec l'escouade donnée. */
export function useRunGauntlet() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  return useMutation({
    mutationFn: (heroIds: string[]) => invokeGauntlet<GauntletRunResponse>({ action: 'run', hero_ids: heroIds }),
    onSuccess: () => {
      // Un run règle la rente au passage (Éclat crédité) et peut battre le record.
      void queryClient.invalidateQueries({ queryKey: ['resources', userId] });
      void queryClient.invalidateQueries({ queryKey: ['gauntlet_state', userId] });
    },
  });
}
