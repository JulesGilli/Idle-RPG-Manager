import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import { heroesQueryKey } from '@/features/heroes/useHeroes';
import type { LearnedSkills, SkillDelta } from '@shared/progression/skills';

type LearnResult = { ok: true; skills: LearnedSkills; skill_points: number };

async function invokeSkills<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('skills', { body });
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

export function useLearnSkill() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  return useMutation({
    mutationFn: (args: { heroId: string; nodeId: string }) =>
      invokeSkills<LearnResult>({ action: 'learn', hero_id: args.heroId, node_id: args.nodeId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: heroesQueryKey(userId) });
    },
  });
}

/**
 * Valide TOUT un lot de points en un appel (mode édition).
 *
 * On envoie le DELTA, jamais l'état complet : le serveur l'ajoute à ce qu'il a,
 * donc un onglet ouvert depuis longtemps ne peut pas écraser des points gagnés
 * entre-temps. S'il refuse (409), c'est que le solde a bougé — on invalide pour
 * repartir de l'état réel.
 */
export function useLearnBatch() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  return useMutation({
    mutationFn: (args: { heroId: string; delta: SkillDelta }) =>
      invokeSkills<LearnResult>({
        action: 'learn_batch',
        hero_id: args.heroId,
        delta: args.delta,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: heroesQueryKey(userId) });
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: heroesQueryKey(userId) });
    },
  });
}

type SelectResult = { ok: true; slot: 'active' | 'ultimate'; node_id: string | null };

/** Équipe l'actif OU l'ultime à activer (un seul de chaque parmi les appris). */
export function useSelectSkill() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  return useMutation({
    mutationFn: (args: { heroId: string; slot: 'active' | 'ultimate'; nodeId: string | null }) =>
      invokeSkills<SelectResult>({
        action: 'select',
        hero_id: args.heroId,
        slot: args.slot,
        node_id: args.nodeId,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: heroesQueryKey(userId) });
    },
  });
}

/** Réinitialise l'arbre d'un héros contre de l'or (RPC `reset_hero_skills`). */
export function useResetSkills() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  return useMutation({
    mutationFn: async (args: { heroId: string }) => {
      const { error } = await supabase.rpc('reset_hero_skills', { p_hero_id: args.heroId });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: heroesQueryKey(userId) });
      void queryClient.invalidateQueries({ queryKey: ['profile', userId] });
    },
  });
}
