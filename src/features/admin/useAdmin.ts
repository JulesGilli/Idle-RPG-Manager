import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

/** Appel brut de l'Edge Function admin-actions (verrouillée à `app_config.admin_ids`). */
async function invokeAdmin<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('admin-actions', { body });
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
  return (data ?? {}) as T;
}

/** Appelle l'Edge Function admin-actions (verrouillée à `app_config.admin_ids` côté serveur). */
export function useAdminAction() {
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => invokeAdmin<Record<string, unknown>>(body),
  });
}

export type AdminPlayerRow = {
  id: string;
  display_name: string | null;
  title: string | null;
  gold: number;
  account_xp: number;
  created_at: string;
  heroes: number;
  max_level: number;
  items: number;
  arc: number;
};

export type AdminItem = {
  id: string;
  name: string;
  item_type: string;
  rarity: string;
  weight: string | null;
  tier: number;
  upgrade_level: number;
  blessing_level: number;
  set_id: string | null;
  atk_bonus: number;
  def_bonus: number;
  hp_bonus: number;
  passive_type: string | null;
  passive_value: number;
  locked: boolean;
};

export type AdminHero = {
  id: string;
  name: string;
  class_id: string;
  level: number;
  xp: number;
  awakened: boolean;
  skill_points: number;
  stat_points: number;
  skills: Record<string, number> | null;
  rune_id: string | null;
  bonus_hp: number;
  bonus_atk: number;
  bonus_def: number;
  bonus_speed: number;
  alloc_hp: number;
  alloc_atk: number;
  alloc_def: number;
  alloc_speed: number;
  weapon: AdminItem | null;
  armor: AdminItem | null;
  jewel: AdminItem | null;
  relic: AdminItem | null;
};

export type AdminInspect = {
  profile: { id: string; display_name: string | null; gold: number; account_xp: number; title: string | null; created_at: string };
  heroes: AdminHero[];
  items: AdminItem[];
  resources: { resource: string; amount: number; tier: number }[];
  arc: { current_arc: number; max_arc: number };
  levels_cleared: number;
  dungeons_cleared: number;
};

/**
 * Annuaire complet des joueurs. Passe par le serveur : la RLS de `profiles` est
 * « select own », le client ne peut voir personne d'autre que lui-même.
 */
export function useAdminPlayers(enabled: boolean) {
  return useQuery({
    queryKey: ['admin_players'],
    enabled,
    staleTime: 30_000,
    queryFn: () => invokeAdmin<{ players: AdminPlayerRow[] }>({ action: 'list_players' }),
  });
}

/** Fiche détaillée d'un joueur (roster monté, inventaire, ressources, progression). */
export function useAdminInspect(playerId: string | null) {
  return useQuery({
    queryKey: ['admin_inspect', playerId],
    enabled: Boolean(playerId),
    staleTime: 15_000,
    queryFn: () => invokeAdmin<AdminInspect>({ action: 'inspect_player', player_id: playerId }),
  });
}
