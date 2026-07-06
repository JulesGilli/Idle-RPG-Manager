import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

/** Joueur autorisé à voir/utiliser le panneau admin (gate réel côté serveur). */
export const ADMIN_ID = 'dfc646d3-f9c5-479e-8812-dca9d2265243';

/** Appelle l'Edge Function admin-actions (verrouillée à ADMIN_ID côté serveur). */
export function useAdminAction() {
  return useMutation({
    mutationFn: async (body: Record<string, unknown>): Promise<Record<string, unknown>> => {
      const { data, error } = await supabase.functions.invoke<Record<string, unknown>>(
        'admin-actions',
        { body },
      );
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
      return data ?? {};
    },
  });
}
