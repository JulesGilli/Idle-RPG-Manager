import { useCallback, useRef, useState } from 'react';
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
  class_id: string;
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

/** Meilleur étage atteint PAR CLASSE (map class_id → best_floor ; absent = 0). */
export function useTowerProgress() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['class_tower_progress', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from('class_tower_progress')
        .select('class_id, best_floor')
        .eq('player_id', userId!);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of data ?? []) map[r.class_id] = r.best_floor;
      return map;
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
      void queryClient.invalidateQueries({ queryKey: ['class_tower_progress', userId] });
    },
  });
}

/** Résout une seule ascension (sans passer par React-Query), pour la boucle auto. */
export function climbTowerOnce(heroId: string): Promise<TowerClimbResponse> {
  return invokeTower({ hero_id: heroId });
}

/* --------------------------------------------------------------- AUTO-CLIMB */

/** Délai entre deux ascensions auto (laisse voir la progression + annuler). */
const AUTO_DELAY_MS = 450;

export type AutoClimbState = {
  running: boolean;
  /** Nombre d'ascensions résolues sur la session auto. */
  runs: number;
  /** Étages franchis au total sur la session auto. */
  floorsGained: number;
  /** Meilleur étage courant (null tant qu'aucun run n'a répondu). */
  bestFloor: number | null;
  toppedOut: boolean;
  /** Butin agrégé sur toute la session auto. */
  loot: { resource: string; amount: number }[];
  /** Dernière ascension (pour un éventuel replay). */
  lastResult: TowerClimbResponse | null;
  error: string | null;
};

const AUTO_INITIAL: AutoClimbState = {
  running: false,
  runs: 0,
  floorsGained: 0,
  bestFloor: null,
  toppedOut: false,
  loot: [],
  lastResult: null,
  error: null,
};

/**
 * Boucle d'auto-grimper (Option A, côté client) : relance `resolve-tower` tant que
 * chaque ascension franchit au moins un étage. Comme chaque combat se joue à PV
 * pleins, une ascension monte jusqu'à son « mur » ; l'auto retente ce mur avec un
 * nouveau seed et s'ARRÊTE au premier run sans progrès (`cleared_new === 0`), au
 * sommet, sur erreur, ou si l'utilisateur coupe le mode.
 */
export function useAutoClimb() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  const cancelRef = useRef(false);
  const [state, setState] = useState<AutoClimbState>(AUTO_INITIAL);

  const start = useCallback(
    async (heroId: string) => {
      cancelRef.current = false;
      setState({ ...AUTO_INITIAL, running: true });
      const lootAcc = new Map<string, number>();
      let runs = 0;
      let gained = 0;
      let last: TowerClimbResponse | null = null;

      try {
        while (!cancelRef.current) {
          const r = await climbTowerOnce(heroId);
          runs++;
          last = r;
          gained += r.cleared_new;
          for (const d of r.loot) lootAcc.set(d.resource, (lootAcc.get(d.resource) ?? 0) + d.amount);

          // Matériaux + progression avancés côté serveur → rafraîchir l'UI.
          void queryClient.invalidateQueries({ queryKey: ['resources', userId] });
          void queryClient.invalidateQueries({ queryKey: ['class_tower_progress', userId] });

          const stop = r.topped_out || r.cleared_new === 0 || cancelRef.current;
          setState({
            running: !stop,
            runs,
            floorsGained: gained,
            bestFloor: r.best_floor,
            toppedOut: r.topped_out,
            loot: [...lootAcc.entries()].map(([resource, amount]) => ({ resource, amount })),
            lastResult: last,
            error: null,
          });

          if (stop) return; // stop au 1er échec / sommet / annulation
          await new Promise((res) => setTimeout(res, AUTO_DELAY_MS));
        }
      } catch (e) {
        setState((s) => ({
          ...s,
          running: false,
          error: e instanceof Error ? e.message : 'Erreur',
        }));
      }
    },
    [queryClient, userId],
  );

  const stop = useCallback(() => {
    cancelRef.current = true;
    setState((s) => ({ ...s, running: false }));
  }, []);

  const reset = useCallback(() => {
    cancelRef.current = true;
    setState(AUTO_INITIAL);
  }, []);

  return { state, start, stop, reset };
}
