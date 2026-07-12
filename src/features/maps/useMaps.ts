import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import { useArc } from '@/features/arc/useArc';

export type Rarity5 = 'poor' | 'common' | 'uncommon' | 'advanced' | 'ultimate';

export type LevelRow = {
  id: string;
  map_id: string;
  level_index: number;
  difficulty: number;
  name: string;
  enemyCount: number;
  /** Somme des PV de tous les ennemis du niveau. */
  enemyHp: number;
  /** Somme des ATK de tous les ennemis du niveau. */
  enemyAtk: number;
  /** Score de puissance agrégé (PV + ATK pondérée + DEF) — ordre d'idée pour le joueur. */
  power: number;
  isBoss: boolean;
  maxRarity: Rarity5;
  resource: string;
};

export type MapRow = {
  id: string;
  name: string;
  accent: string;
  resource: string;
  maxRarity: Rarity5;
  levels: LevelRow[];
};

export type DeploymentRow = {
  id: string;
  level_id: string;
  hero_ids: string[];
  mode: 'advance' | 'loop';
  last_resolved_at: string;
  last_combat: unknown;
  last_wins: number;
  last_losses: number;
  last_fights: number;
  blocked: boolean;
  clears_count: number;
};

type EnemyStat = { hp?: number; atk?: number; def?: number; speed?: number };
type EnemyConfig = { enemies: EnemyStat[] };

/** Agrège les stats d'un groupe d'ennemis en totaux + score de puissance. */
function enemyStats(cfg: EnemyConfig): { count: number; hp: number; atk: number; power: number } {
  const enemies = cfg.enemies ?? [];
  let hp = 0;
  let atk = 0;
  let def = 0;
  for (const e of enemies) {
    hp += e.hp ?? 0;
    atk += e.atk ?? 0;
    def += e.def ?? 0;
  }
  // Puissance : PV bruts + ATK très pondérée (menace de burst) + DEF (encaisse).
  const power = Math.round(hp + atk * 10 + def * 5);
  return { count: enemies.length, hp, atk, power };
}

export function useMaps() {
  return useQuery({
    queryKey: ['maps'],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<MapRow[]> => {
      const [{ data: maps, error: mapsErr }, { data: levels, error: lvlErr }] = await Promise.all([
        supabase.from('maps').select('id, name, accent, sort, resource, max_rarity').order('sort'),
        supabase
          .from('levels')
          .select('id, map_id, level_index, difficulty, name, is_boss, enemy_config')
          .order('level_index'),
      ]);
      if (mapsErr) throw mapsErr;
      if (lvlErr) throw lvlErr;

      return (maps ?? []).map((m) => ({
        id: m.id,
        name: m.name,
        accent: m.accent,
        resource: m.resource,
        maxRarity: m.max_rarity as Rarity5,
        levels: (levels ?? [])
          .filter((l) => l.map_id === m.id)
          .map((l) => {
            const stats = enemyStats(l.enemy_config as unknown as EnemyConfig);
            return {
              id: l.id,
              map_id: l.map_id,
              level_index: l.level_index,
              difficulty: l.difficulty,
              name: l.name,
              enemyCount: stats.count,
              enemyHp: stats.hp,
              enemyAtk: stats.atk,
              power: stats.power,
              isBoss: l.is_boss,
              maxRarity: m.max_rarity as Rarity5,
              resource: m.resource,
            };
          }),
      }));
    },
  });
}

export function useLevelProgress() {
  const userId = useAuthStore((s) => s.user?.id);
  const { currentArc } = useArc();
  return useQuery({
    // Progression SCOPÉE par arc : en arc 2 on repart de zéro (progression propre).
    queryKey: ['level_progress', userId, currentArc],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from('level_progress')
        .select('level_id')
        .eq('player_id', userId!)
        .eq('arc', currentArc);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.level_id));
    },
  });
}

export function useDeployments() {
  const userId = useAuthStore((s) => s.user?.id);
  const { currentArc } = useArc();
  return useQuery({
    // Déploiements de l'arc courant seulement (un farm appartient à son arc).
    queryKey: ['deployments', userId, currentArc],
    enabled: Boolean(userId),
    queryFn: async (): Promise<DeploymentRow[]> => {
      const { data, error } = await supabase
        .from('deployments')
        .select(
          'id, level_id, hero_ids, mode, last_resolved_at, last_combat, last_wins, last_losses, last_fights, blocked, clears_count',
        )
        .eq('player_id', userId!)
        .eq('arc', currentArc)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((d) => ({
        id: d.id,
        level_id: d.level_id,
        hero_ids: d.hero_ids,
        mode: d.mode === 'loop' ? 'loop' : 'advance',
        last_resolved_at: d.last_resolved_at,
        last_combat: d.last_combat,
        last_wins: d.last_wins,
        last_losses: d.last_losses,
        last_fights: d.last_fights,
        blocked: d.blocked,
        clears_count: d.clears_count,
      }));
    },
  });
}
