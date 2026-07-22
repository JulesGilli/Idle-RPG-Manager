import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import type { CombatEvent, CombatantFinalState, CombatResultKind } from '@shared/combat/types';
import type { BattlefieldBlock } from '@shared/progression/battlefield';

async function invokeBattlefield<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('resolve-battlefield', { body });
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

/** Une bataille telle que le serveur la décrit (état de déblocage + cooldown propre). */
export type BattlefieldRow = {
  id: string;
  idx: number;
  name: string;
  flavor: string;
  gold: number;
  unlocked: boolean;
  cleared: boolean;
  /** Millisecondes avant que CETTE bataille redevienne disponible (0 = prête). */
  cooldown_remaining_ms: number;
};

export type BattlefieldStatus = {
  arc: number;
  cooldown_hours: number;
  dust_reward: number;
  highest_cleared: number;
  max_team: number;
  battlefields: BattlefieldRow[];
};

export type BattlefieldRunResult = {
  won: boolean;
  reward: { dust: number; gold: number };
  cooldown_remaining_ms: number;
  highest_cleared: number;
  combat: {
    rounds: number;
    events: CombatEvent[];
    final_state: CombatantFinalState[];
    result: CombatResultKind;
  };
};

/** Refus renvoyé par le serveur, avec son motif partagé (`BattlefieldBlock`). */
export type BattlefieldError = Error & { block?: BattlefieldBlock };

export function useBattlefieldStatus() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['battlefield-status', userId],
    enabled: Boolean(userId),
    queryFn: () => invokeBattlefield<BattlefieldStatus>({ action: 'status' }),
  });
}

export function useRunBattlefield() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  return useMutation({
    mutationFn: (args: { battlefieldId: string; heroIds: string[] }) =>
      invokeBattlefield<BattlefieldRunResult>({
        action: 'run',
        battlefield_id: args.battlefieldId,
        hero_ids: args.heroIds,
      }),
    onSuccess: () => {
      // Le quota du jour ET la progression changent → statut à refetch.
      void queryClient.invalidateQueries({ queryKey: ['battlefield-status', userId] });
      void queryClient.invalidateQueries({ queryKey: ['profile', userId] });
      // La Poussière bénie créditée alimente la Forge Sacrée : sans cette
      // invalidation, l'armure divine resterait affichée comme incraftable.
      void queryClient.invalidateQueries({ queryKey: ['resources', userId] });
    },
  });
}
