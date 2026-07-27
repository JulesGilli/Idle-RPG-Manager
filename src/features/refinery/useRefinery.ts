import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';

/** État de la Raffinerie renvoyé par l'edge function `resource-refinery`. */
export type RefineryState = {
  /** Le bâtiment est-il débloqué pour ce joueur (Arc ≥ min_arc) ? */
  unlocked: boolean;
  min_arc: number;
  level: number;
  max_level: number;
  /** Bonus de drop courant, en % entiers. */
  bonus_pct: number;
  /** Bonus au prochain niveau, ou null au max. */
  next_bonus_pct: number | null;
  drop_mult: number;
  /** Coût en or du prochain niveau, ou null au max. */
  next_cost: number | null;
  maxed: boolean;
  /** Or courant du joueur (pour savoir si l'upgrade est payable). */
  gold: number;
};

async function invokeRefinery<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('resource-refinery', { body });
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

export const refineryQueryKey = (userId: string | undefined) => ['refinery', userId] as const;

export function useRefinery() {
  const userId = useAuthStore((s) => s.user?.id);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: refineryQueryKey(userId),
    enabled: Boolean(userId),
    queryFn: () => invokeRefinery<RefineryState>({ action: 'get' }),
  });

  const upgrade = useMutation({
    mutationFn: () => invokeRefinery<RefineryState & { ok: boolean; spent: number }>({ action: 'upgrade' }),
    onSuccess: (data) => {
      // La réponse d'upgrade EST l'état à jour : on rafraîchit le cache sans
      // aller-retour, et on invalide le profil (l'or vient d'être dépensé).
      queryClient.setQueryData(refineryQueryKey(userId), data);
      void queryClient.invalidateQueries({ queryKey: ['profile', userId] });
    },
  });

  return { query, upgrade };
}
