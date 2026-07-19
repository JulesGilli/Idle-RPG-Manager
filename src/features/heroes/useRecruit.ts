import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import type { Grade, RecruitBonuses } from '@shared/progression/recruit';
import { heroesQueryKey } from './useHeroes';

export type RecruitedHero = {
  id: string;
  name: string;
  class_id: string;
  bonus_hp: number;
  bonus_atk: number;
  bonus_def: number;
  bonus_speed: number;
};

export type TavernCandidate = {
  slot: number;
  class_id: string;
  class_name: string;
  name: string;
  grade: Grade;
  bonuses: RecruitBonuses;
  stats: { hp: number; atk: number; def: number; speed: number };
  claimed: boolean;
};

export type TavernPool = {
  day: string;
  /** Prochain renouvellement (ISO), calculé côté SERVEUR — 22 h, heure de Paris. */
  resets_at?: string;
  /** Heure serveur à la réponse : corrige une horloge locale décalée. */
  server_now?: string;
  candidates: TavernCandidate[];
  cost: number;
  roster_size: number;
  max_roster: number;
  /** Zones terminées (boss battus) — pilote le bonus de qualité des recrues. */
  zones_completed?: number;
  /** Décalage de la fourchette de naissance vers le haut (0..0.22). */
  quality_bonus?: number;
  /** Prix du PROCHAIN reroll manuel, en plumes d'appel (1, puis 2, puis 3…). */
  reroll_cost?: number;
  /** Clé de la ressource qui paie le reroll (`plume_appel`). */
  reroll_currency?: string;
  /** Rerolls payants déjà faits depuis le renouvellement de 22 h. */
  rerolls_today?: number;
  /** Solde de plumes du joueur — `tavern_state` n'étant pas lisible en RLS. */
  feathers?: number;
};

async function invokeRecruit<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('recruit', { body });
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

export const tavernQueryKey = (userId: string | undefined) => ['tavern', userId] as const;

export function useTavernPool() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: tavernQueryKey(userId),
    enabled: Boolean(userId),
    queryFn: () => invokeRecruit<TavernPool>({ action: 'pool' }),
    staleTime: 60_000,
  });
}

export function useRecruit() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: heroesQueryKey(userId) });
    void queryClient.invalidateQueries({ queryKey: tavernQueryKey(userId) });
    void queryClient.invalidateQueries({ queryKey: ['profile', userId] });
    void queryClient.invalidateQueries({ queryKey: ['deployments', userId] });
    void queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
    // Le reroll débite des plumes : sans ça le compteur de ressources reste
    // périmé jusqu'au prochain refetch, et l'inventaire ment sur le solde.
    void queryClient.invalidateQueries({ queryKey: ['resources', userId] });
    void queryClient.invalidateQueries({ queryKey: ['resources_by_tier', userId] });
  };

  const recruit = useMutation({
    mutationFn: (slot: number) =>
      invokeRecruit<{ hero: RecruitedHero; cost: number }>({ action: 'recruit', slot }),
    onSuccess: invalidate,
  });

  const dismiss = useMutation({
    mutationFn: (heroId: string) =>
      invokeRecruit<{ ok: true }>({ action: 'dismiss', hero_id: heroId }),
    onSuccess: invalidate,
  });

  /**
   * Reroll payant du pool. Le serveur renvoie le pool complet : on l'écrit
   * directement dans le cache pour que les nouvelles recrues s'affichent sans
   * aller-retour supplémentaire (l'invalidation qui suit ne fera que confirmer).
   */
  const reroll = useMutation({
    mutationFn: () => invokeRecruit<TavernPool>({ action: 'reroll' }),
    onSuccess: (pool) => {
      queryClient.setQueryData(tavernQueryKey(userId), pool);
      invalidate();
    },
  });

  return { recruit, dismiss, reroll };
}
