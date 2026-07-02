import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import { heroesQueryKey } from '@/features/heroes/useHeroes';
import type { LearnedSkills } from '@shared/progression/skills';

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
