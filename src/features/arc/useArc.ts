import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';

export type PlayerArc = { current_arc: number; max_arc: number };

/* ⚠️ BRANCHE `test-arc2` UNIQUEMENT — NE JAMAIS MERGER DANS main ⚠️
 *
 * Déblocage LOCAL de l'Arc 2 pour tester son UI sans toucher la DB ni la prod.
 * Gaté sur `import.meta.env.DEV` : vrai seulement sous `npm run dev`, faux dans
 * TOUT build de production — même déployée, cette branche ne débloquerait rien.
 *
 * Arc courant lu depuis localStorage (défaut 2). L'interrupteur d'arc de l'app
 * écrit ce localStorage et recharge : il reste testable, 100 % côté client.
 *   • repasser en Arc 1 :  localStorage.setItem('dev_arc','1')  (ou via l'UI)
 * Le CRAFT réel (Forge Sacrée) échouera quand même : le serveur, lui, lit le
 * vrai `player_arc`. Ici on juge l'UX, pas le back.
 */
const DEV_ARC2 = import.meta.env.DEV;
function readDevArc(): number {
  try {
    return Math.max(1, Number(localStorage.getItem('dev_arc') ?? '2') || 2);
  } catch {
    return 2;
  }
}

export const playerArcQueryKey = (userId: string | undefined) => ['player_arc', userId] as const;

async function invokeArc<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('arc', { body });
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

export function useArc(): {
  currentArc: number;
  maxArc: number;
  switchArc: (arc: number) => void;
  isSwitching: boolean;
} {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  const query = useQuery({
    queryKey: playerArcQueryKey(userId),
    enabled: Boolean(userId),
    queryFn: async (): Promise<PlayerArc> => {
      const { data, error } = await supabase
        .from('player_arc')
        .select('current_arc, max_arc')
        .eq('player_id', userId!)
        .maybeSingle();
      if (error) throw error;
      return {
        current_arc: Math.max(1, data?.current_arc ?? 1),
        max_arc: Math.max(1, data?.max_arc ?? 1),
      };
    },
  });

  const mutation = useMutation({
    mutationFn: (arc: number) => invokeArc<PlayerArc>({ action: 'set', arc }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['player_arc'] });
      void queryClient.invalidateQueries({ queryKey: ['resources'] });
      void queryClient.invalidateQueries({ queryKey: ['maps'] });
      void queryClient.invalidateQueries({ queryKey: ['level_progress', userId] });
      void queryClient.invalidateQueries({ queryKey: ['arc_progress', userId] });
    },
  });

  // BRANCHE test-arc2 : override client-only, gaté DEV (cf. en-tête). L'interrupteur
  // d'arc écrit localStorage et recharge — le vrai serveur `arc` n'est pas appelé.
  if (DEV_ARC2) {
    return {
      currentArc: readDevArc(),
      maxArc: 2,
      switchArc: (arc: number) => {
        localStorage.setItem('dev_arc', String(Math.max(1, arc)));
        window.location.reload();
      },
      isSwitching: false,
    };
  }

  return {
    currentArc: query.data?.current_arc ?? 1,
    maxArc: query.data?.max_arc ?? 1,
    switchArc: (arc: number) => mutation.mutate(arc),
    isSwitching: mutation.isPending,
  };
}
