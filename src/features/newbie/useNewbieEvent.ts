import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import type { NewbieObjectiveProgress } from '@shared/progression/newbieEvent';

/**
 * État de l'event nouveau joueur (Arc 1). L'edge function ouvre l'event au 1er
 * appel `state`, renvoie la progression + ce qui est déjà réclamé, et applique
 * les dons via `claim_objective` / `claim_milestone`. Les libellés/récompenses
 * des objectifs viennent du module partagé côté client (`NEWBIE_OBJECTIVES`).
 */
export type NewbieEventState = {
  eligible: boolean;
  /** Arc cible de l'event (1 = Nouveau Venu, 2 = Terres du Désespoir). */
  arc?: number;
  event: { starts_at: string; ends_at: string } | null;
  active?: boolean;
  server_now?: string;
  /** Zone la plus loin atteinte (Arc 1) — pour afficher les récompenses à offset. */
  furthest_zone?: number;
  objectives?: NewbieObjectiveProgress[];
  pct?: number;
  milestones_reached?: number[];
  claimed_objectives?: string[];
  claimed_milestones?: number[];
};

/** Choix passé à une réclamation (selon la récompense). */
export type NewbieChoice =
  | { base_id: string } // équipement
  | { relic_base_id: string } // relique
  | { class_id: string }; // héros S

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

export function useNewbieEvent(pollMs?: number) {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  const query = useQuery({
    queryKey: newbieEventQueryKey(userId),
    enabled: Boolean(userId),
    ...(pollMs ? { refetchInterval: pollMs } : {}),
    queryFn: () => invoke<NewbieEventState>({ action: 'state' }),
  });

  // Un don peut créditer or / XP de compte / ressources / objets / héros : on
  // rafraîchit tout ce qui peut avoir bougé, en plus de l'event lui-même.
  const invalidateAll = () => {
    void qc.invalidateQueries({ queryKey: newbieEventQueryKey(userId) });
    void qc.invalidateQueries({ queryKey: ['items', userId] });
    void qc.invalidateQueries({ queryKey: ['heroes', userId] });
    void qc.invalidateQueries({ queryKey: ['profile', userId] });
    void qc.invalidateQueries({ queryKey: ['resources', userId] });
    void qc.invalidateQueries({ queryKey: ['resources_by_tier', userId] });
    void qc.invalidateQueries({ queryKey: ['account', userId] });
  };

  const claimObjective = useMutation({
    mutationFn: (args: { objectiveId: string; choice?: NewbieChoice }) =>
      invoke<{ ok: boolean }>({ action: 'claim_objective', objective_id: args.objectiveId, choice: args.choice }),
    onSuccess: invalidateAll,
  });

  const claimMilestone = useMutation({
    mutationFn: (args: { pct: number; choice?: NewbieChoice }) =>
      invoke<{ ok: boolean }>({ action: 'claim_milestone', pct: args.pct, choice: args.choice }),
    onSuccess: invalidateAll,
  });

  return { state: query, claimObjective, claimMilestone };
}
