import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import type { CombatEvent, CombatantFinalState } from '@shared/combat';

/* ------------------------------------------------------------------ TYPES */

export type LootEntry = { resource: string; min: number; max: number; chance: number };

export type MonsterTemplate = { name: string; hp: number; atk: number; def: number; speed: number };

export type DungeonTypeRow = {
  id: string;
  name: string;
  tier: number;
  monster_sequence: { name: string; enemies: MonsterTemplate[] }[];
  regen_pct_between_fights: number | string;
  miniboss_indices: number[];
  boss_index: number;
  loot_table_normal: LootEntry[];
  loot_table_miniboss: LootEntry[];
  loot_table_boss: LootEntry[];
};

/** Combat d'un donjon tel que renvoyé par l'Edge Function (camelCase). */
export type DungeonCombat = {
  result: 'win' | 'loss';
  seed: number;
  rounds: number;
  events: CombatEvent[];
  finalState: CombatantFinalState[];
};

export type DungeonFightResult = {
  index: number;
  kind: 'normal' | 'miniboss' | 'boss';
  enemyName: string;
  hpBefore: { id: string; hp: number; maxHp: number }[];
  combat: DungeonCombat;
};

export type DungeonRunResponse = {
  run_id: string | null;
  success: boolean;
  reached_index: number;
  seed: number;
  dungeon: { id: string; name: string; tier: number };
  fight_results: DungeonFightResult[];
  loot: { resource: string; amount: number }[];
};

/* ------------------------------------------------------------------ QUERIES */

/** Liste des types de donjon (table de référence, lecture publique authentifiée). */
export function useDungeonTypes() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['dungeon_types'],
    enabled: Boolean(userId),
    queryFn: async (): Promise<DungeonTypeRow[]> => {
      const { data, error } = await supabase
        .from('dungeon_types')
        .select(
          'id, name, tier, monster_sequence, regen_pct_between_fights, ' +
            'miniboss_indices, boss_index, loot_table_normal, loot_table_miniboss, loot_table_boss',
        )
        .order('tier', { ascending: true })
        .order('id', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as DungeonTypeRow[];
    },
  });
}

/**
 * Dernier run par type de donjon (timestamp), pour calculer le cooldown côté
 * client. Lecture RLS « select own » sur dungeon_runs.
 */
export function useDungeonCooldowns() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['dungeon_cooldowns', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from('dungeon_runs')
        .select('dungeon_type_id, created_at')
        .eq('player_id', userId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const latest: Record<string, number> = {};
      for (const r of data ?? []) {
        const id = r.dungeon_type_id as string;
        if (!(id in latest)) latest[id] = new Date(r.created_at as string).getTime();
      }
      return latest;
    },
  });
}

/* ------------------------------------------------------------------ MUTATION */

async function invokeDungeon(body: Record<string, unknown>): Promise<DungeonRunResponse> {
  const { data, error } = await supabase.functions.invoke<DungeonRunResponse>('resolve-dungeon-run', {
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

export type LoanableHero = {
  id: string;
  name: string;
  class_id: string;
  level: number;
  owner_id: string;
  owner_name: string;
};

/** Héros d'autres joueurs actuellement empruntables (via list-loanable-heroes). */
export function useLoanableHeroes() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['loanable-heroes'],
    enabled: Boolean(userId),
    queryFn: async (): Promise<LoanableHero[]> => {
      const { data, error } = await supabase.functions.invoke<{ heroes: LoanableHero[] }>(
        'list-loanable-heroes',
        { body: {} },
      );
      if (error) throw error;
      return data?.heroes ?? [];
    },
  });
}

export function useRunDungeon() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  return useMutation({
    mutationFn: (args: { dungeonTypeId: string; heroIds: string[] }) =>
      invokeDungeon({ dungeon_type_id: args.dungeonTypeId, hero_ids: args.heroIds }),
    onSuccess: () => {
      // Le loot (matériaux) est crédité côté serveur → rafraîchir le sac.
      void queryClient.invalidateQueries({ queryKey: ['resources', userId] });
      // Nouveau run → le cooldown de ce donjon redémarre.
      void queryClient.invalidateQueries({ queryKey: ['dungeon_cooldowns', userId] });
    },
  });
}
