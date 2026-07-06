import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import type { CombatEvent, CombatantFinalState } from '@shared/combat';

/* ------------------------------------------------------------------ TYPES */

/** Combat d'un étage tel que renvoyé par l'Edge Function. */
export type TowerCombat = {
  result: 'win' | 'loss';
  seed: number;
  rounds: number;
  events: CombatEvent[];
  finalState: CombatantFinalState[];
};

export type TowerFightResult = {
  floor: number;
  kind: 'normal' | 'guardian' | 'boss';
  enemyName: string;
  hpBefore: { id: string; hp: number; maxHp: number }[];
  combat: TowerCombat;
};

export type TowerClimbResponse = {
  run_id: string | null;
  hero_id: string;
  seed: number;
  from_floor: number;
  reached_floor: number;
  cleared_new: number;
  topped_out: boolean;
  best_floor: number;
  max_floor: number;
  fight_results: TowerFightResult[];
  loot: { resource: string; amount: number }[];
};

/* ------------------------------------------------------------------ QUERY */

/** Meilleur étage atteint par le joueur (0 = jamais grimpé). */
export function useTowerProgress() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['tower_progress', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from('tower_progress')
        .select('best_floor')
        .eq('player_id', userId!)
        .maybeSingle();
      if (error) throw error;
      return data?.best_floor ?? 0;
    },
  });
}

/* ------------------------------------------------------------------ MUTATION */

async function invokeTower(body: Record<string, unknown>): Promise<TowerClimbResponse> {
  const { data, error } = await supabase.functions.invoke<TowerClimbResponse>('resolve-tower', {
    body,
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
}

export function useClimbTower() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  return useMutation({
    mutationFn: (args: { heroId: string }) => invokeTower({ hero_id: args.heroId }),
    onSuccess: () => {
      // Matériaux crédités côté serveur + progression avancée → rafraîchir.
      void queryClient.invalidateQueries({ queryKey: ['resources', userId] });
      void queryClient.invalidateQueries({ queryKey: ['tower_progress', userId] });
    },
  });
}
