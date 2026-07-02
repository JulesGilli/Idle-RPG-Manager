import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import {
  effectiveStats,
  heroPower,
  xpToNextLevel,
  type EffectiveStats,
} from '@shared/progression/formulas';
import { recruitGrade, type Grade, type RecruitBonuses } from '@shared/progression/recruit';

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
  statPoints: number;
  classWeight: string;
  /** Grade du roll de naissance (S/A/B/C/D). */
  grade: Grade;
  /** Bonus/malus de naissance par stat. */
  innate: RecruitBonuses;
  alloc: { hp: number; atk: number; def: number; speed: number };
  weapon: ItemView | null;
  armor: ItemView | null;
  jewel: ItemView | null;
  relic: ItemView | null;
};

const HERO_SELECT = `
  id, name, class_id, level, xp, stat_points, alloc_hp, alloc_atk, alloc_def, alloc_speed,
  bonus_hp, bonus_atk, bonus_def, bonus_speed,
  cls:hero_classes!heroes_class_id_fkey(name, weight, base_hp, base_atk, base_def, base_speed),
  weapon:items!heroes_equipped_weapon_id_fkey(id, name, item_type, rarity, atk_bonus, def_bonus, hp_bonus),
  armor:items!heroes_equipped_armor_id_fkey(id, name, item_type, rarity, atk_bonus, def_bonus, hp_bonus),
  jewel:items!heroes_equipped_jewel_id_fkey(id, name, item_type, rarity, atk_bonus, def_bonus, hp_bonus),
  relic:items!heroes_equipped_relic_id_fkey(id, name, item_type, rarity, atk_bonus, def_bonus, hp_bonus)
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
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });
      if (error) throw error;

      return (data ?? []).map((h) => {
        const cls = h.cls;
        const equipped = [h.weapon, h.armor, h.jewel, h.relic];
        const bonuses = {
          atk: equipped.reduce((s, it) => s + (it?.atk_bonus ?? 0), 0),
          def: equipped.reduce((s, it) => s + (it?.def_bonus ?? 0), 0),
          hp: equipped.reduce((s, it) => s + (it?.hp_bonus ?? 0), 0),
        };
        const alloc = {
          hp: h.alloc_hp,
          atk: h.alloc_atk,
          def: h.alloc_def,
          speed: h.alloc_speed,
        };
        const innate = {
          bonus_hp: h.bonus_hp,
          bonus_atk: h.bonus_atk,
          bonus_def: h.bonus_def,
          bonus_speed: h.bonus_speed,
        };
        // Base individuelle = base de classe + roll de naissance (jamais < 1).
        const stats = effectiveStats(
          {
            hp: Math.max(1, cls.base_hp + innate.bonus_hp),
            atk: Math.max(1, cls.base_atk + innate.bonus_atk),
            def: Math.max(0, cls.base_def + innate.bonus_def),
            speed: Math.max(1, cls.base_speed + innate.bonus_speed),
          },
          h.level,
          bonuses,
          alloc,
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
          statPoints: h.stat_points,
          classWeight: cls.weight,
          grade: recruitGrade(innate, {
            id: h.class_id,
            base_hp: cls.base_hp,
            base_atk: cls.base_atk,
            base_def: cls.base_def,
            base_speed: cls.base_speed,
          }),
          innate,
          alloc,
          weapon: h.weapon ?? null,
          armor: h.armor ?? null,
          jewel: h.jewel ?? null,
          relic: h.relic ?? null,
        };
      });
    },
  });
}
