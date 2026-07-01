import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import {
  effectiveStats,
  heroPower,
  xpToNextLevel,
  type EffectiveStats,
} from '@shared/progression/formulas';

export type ItemView = {
  id: string;
  name: string;
  item_type: string;
  rarity: string;
  atk_bonus: number;
  def_bonus: number;
  hp_bonus: number;
};

export type HeroView = {
  id: string;
  name: string;
  classId: string;
  className: string;
  level: number;
  xp: number;
  xpToNext: number;
  stats: EffectiveStats;
  power: number;
  weapon: ItemView | null;
  armor: ItemView | null;
};

const HERO_SELECT = `
  id, name, class_id, level, xp,
  cls:hero_classes!heroes_class_id_fkey(name, base_hp, base_atk, base_def, base_speed),
  weapon:items!heroes_equipped_weapon_id_fkey(id, name, item_type, rarity, atk_bonus, def_bonus, hp_bonus),
  armor:items!heroes_equipped_armor_id_fkey(id, name, item_type, rarity, atk_bonus, def_bonus, hp_bonus)
` as const;

export const heroesQueryKey = (userId: string | undefined) => ['heroes', userId] as const;

export function useHeroes() {
  const userId = useAuthStore((s) => s.user?.id);

  return useQuery({
    queryKey: heroesQueryKey(userId),
    enabled: Boolean(userId),
    queryFn: async (): Promise<HeroView[]> => {
      const { data, error } = await supabase
        .from('heroes')
        .select(HERO_SELECT)
        .eq('owner_id', userId!)
        .order('created_at', { ascending: true });
      if (error) throw error;

      return (data ?? []).map((h) => {
        const cls = h.cls;
        const weapon = h.weapon;
        const armor = h.armor;
        const bonuses = {
          atk: (weapon?.atk_bonus ?? 0) + (armor?.atk_bonus ?? 0),
          def: (weapon?.def_bonus ?? 0) + (armor?.def_bonus ?? 0),
          hp: (weapon?.hp_bonus ?? 0) + (armor?.hp_bonus ?? 0),
        };
        const stats = effectiveStats(
          { hp: cls.base_hp, atk: cls.base_atk, def: cls.base_def, speed: cls.base_speed },
          h.level,
          bonuses,
        );
        return {
          id: h.id,
          name: h.name,
          classId: h.class_id,
          className: cls.name,
          level: h.level,
          xp: h.xp,
          xpToNext: xpToNextLevel(h.level),
          stats,
          power: heroPower(stats),
          weapon: weapon ?? null,
          armor: armor ?? null,
        };
      });
    },
  });
}
