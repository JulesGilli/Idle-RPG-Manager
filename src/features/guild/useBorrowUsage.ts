import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import {
  BORROW_DUNGEON_PER_DAY,
  BORROW_MAP_FIGHTS_PER_DAY,
} from '@shared/progression/garrison';

// garrison_borrow_usage n'est pas dans les types générés → client permissif.
const gdb = supabase as unknown as SupabaseClient;

/** Date du jour 'YYYY-MM-DD' au fuseau Europe/Paris (même règle que le serveur). */
function parisToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export type BorrowUsage = { dungeon_runs: number; map_fights: number };

/**
 * Consommation du jour des héros EMPRUNTÉS par le joueur (donjon + combats carte),
 * pour afficher le reliquat. Le bridage réel est appliqué côté serveur.
 */
export function useBorrowUsage() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['borrow-usage', userId],
    enabled: Boolean(userId),
    // Rafraîchi souvent : les combats carte se consomment vite en boucle.
    staleTime: 20_000,
    queryFn: async (): Promise<Map<string, BorrowUsage>> => {
      const { data } = await gdb
        .from('garrison_borrow_usage')
        .select('hero_id, dungeon_runs, map_fights')
        .eq('borrower_player_id', userId!)
        .eq('usage_date', parisToday());
      const map = new Map<string, BorrowUsage>();
      for (const r of data ?? []) {
        map.set(r.hero_id as string, {
          dungeon_runs: (r.dungeon_runs as number) ?? 0,
          map_fights: (r.map_fights as number) ?? 0,
        });
      }
      return map;
    },
  });
}

/** Runs de donjon restants aujourd'hui pour un héros emprunté. */
export function dungeonLeft(usage: Map<string, BorrowUsage> | undefined, heroId: string): number {
  return Math.max(0, BORROW_DUNGEON_PER_DAY - (usage?.get(heroId)?.dungeon_runs ?? 0));
}

/** Combats de carte restants aujourd'hui pour un héros emprunté. */
export function mapFightsLeft(usage: Map<string, BorrowUsage> | undefined, heroId: string): number {
  return Math.max(0, BORROW_MAP_FIGHTS_PER_DAY - (usage?.get(heroId)?.map_fights ?? 0));
}
