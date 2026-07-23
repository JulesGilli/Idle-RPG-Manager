import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import type { NewbieObjectiveProgress } from '@shared/progression/newbieEvent';

/**
 * État de l'event nouveau joueur (Arc 1). L'edge function ouvre l'event au 1er
 * appel `state` pour un compte encore en Arc 1, puis renvoie la progression des
 * objectifs calculée DANS la fenêtre. Les libellés/récompenses des objectifs
 * viennent du module partagé côté client (`NEWBIE_OBJECTIVES`) — le serveur ne
 * renvoie que l'avancement, pour un payload léger.
 */
export type NewbieEventState = {
  eligible: boolean;
  event: { starts_at: string; ends_at: string } | null;
  active?: boolean;
  server_now?: string;
  objectives?: NewbieObjectiveProgress[];
  pct?: number;
  milestones_reached?: number[];
};

export const newbieEventQueryKey = (userId: string | undefined) => ['newbie_event', userId] as const;

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('newbie-event', { body });
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

/**
 * @param pollMs cadence de rafraîchissement (défaut : pas de polling — l'état ne
 *   bouge qu'après une activité du joueur, et React Query re-fetch au focus).
 *   La pastille du header passera une cadence lente comme pour l'arc-event.
 */
export function useNewbieEvent(pollMs?: number) {
  const userId = useAuthStore((s) => s.user?.id);
  const query = useQuery({
    queryKey: newbieEventQueryKey(userId),
    enabled: Boolean(userId),
    ...(pollMs ? { refetchInterval: pollMs } : {}),
    queryFn: () => invoke<NewbieEventState>({ action: 'state' }),
  });
  return { state: query };
}
