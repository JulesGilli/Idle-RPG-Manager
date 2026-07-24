import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import {
  effectiveStats,
  statBreakdown,
  heroPower,
  xpToNextLevel,
  catchUpCapLevel,
  catchUpXpMult,
  CATCH_UP_XP_MULT,
  type EffectiveStats,
  type StatBreakdown,
} from '@shared/progression/formulas';
import { recruitGrade, type Grade, type RecruitBonuses } from '@shared/progression/recruit';
import { type LearnedSkills } from '@shared/progression/skills';
import { computeSetBonuses, equippedSetTier, activeSets, type ActiveSet } from '@shared/progression/sets';

export type ItemView = {
  id: string;
  name: string;
  item_type: string;
  rarity: string;
  upgrade_level: number;
  /** Bénédiction (armes uniquement) : étoiles ROUGES de la bande d'étoiles. */
  blessing_level?: number;
  atk_bonus: number;
  def_bonus: number;
  hp_bonus: number;
  set_id: string | null;
  /**
   * Passif de combat : gemme (bijou) ou stat secondaire du modèle (Arc → crit,
   * Dague → esquive). `passive_value` en % entiers.
   */
  passive_type?: string | null;
  passive_value?: number;
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
  statBreakdown: StatBreakdown;
  power: number;
  statPoints: number;
  /** Points de compétence disponibles (dépensés à la Bibliothèque du Savoir). */
  skillPoints: number;
  /** Nœuds d'arbre appris : nodeId → rang. */
  skills: LearnedSkills;
  /** Actif équipé (un seul appliqué en combat). null → repli 1er appris. */
  activeSkillId: string | null;
  /** Ultime équipé (un seul appliqué en combat). null → repli 1er appris. */
  ultimateSkillId: string | null;
  classWeight: string;
  /** Grade du roll de naissance (S/A/B/C/D). */
  grade: Grade;
  /** Héros éveillé (V2) → dispose d'un slot de rune. */
  awakened: boolean;
  /** Id de la rune équipée (V2), ou null. */
  runeId: string | null;
  /** Bonus/malus de naissance par stat. */
  innate: RecruitBonuses;
  alloc: { hp: number; atk: number; def: number; speed: number };
  weapon: ItemView | null;
  armor: ItemView | null;
  jewel: ItemView | null;
  relic: ItemView | null;
  /** Sets d'ensemble actifs (≥2 pièces) — pour l'affichage. */
  sets: ActiveSet[];
  /**
   * Épinglé par le joueur. Les favoris remontent en tête de TOUTES les listes de
   * héros, quelle que soit l'activité — cf. le tri dans `useHeroes`.
   */
  favorite: boolean;
};

const HERO_SELECT = `
  id, name, class_id, level, xp, stat_points, skill_points, skills, favorite,
  active_skill_id, ultimate_skill_id, awakened, rune_id,
  alloc_hp, alloc_atk, alloc_def, alloc_speed,
  bonus_hp, bonus_atk, bonus_def, bonus_speed,
  cls:hero_classes!heroes_class_id_fkey(name, weight, base_hp, base_atk, base_def, base_speed),
  weapon:items!heroes_equipped_weapon_id_fkey(id, name, item_type, rarity, upgrade_level, blessing_level, atk_bonus, def_bonus, hp_bonus, base_atk_bonus, base_def_bonus, base_hp_bonus, craft_cost, tier, set_id, passive_type, passive_value),
  armor:items!heroes_equipped_armor_id_fkey(id, name, item_type, rarity, upgrade_level, blessing_level, atk_bonus, def_bonus, hp_bonus, base_atk_bonus, base_def_bonus, base_hp_bonus, craft_cost, tier, set_id, passive_type, passive_value),
  jewel:items!heroes_equipped_jewel_id_fkey(id, name, item_type, rarity, upgrade_level, blessing_level, atk_bonus, def_bonus, hp_bonus, base_atk_bonus, base_def_bonus, base_hp_bonus, craft_cost, tier, set_id, passive_type, passive_value),
  relic:items!heroes_equipped_relic_id_fkey(id, name, item_type, rarity, upgrade_level, blessing_level, atk_bonus, def_bonus, hp_bonus, base_atk_bonus, base_def_bonus, base_hp_bonus, craft_cost, tier, set_id, passive_type, passive_value)
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
        const setIds = equipped.map((it) => it?.set_id ?? null);
        // Tier des PIÈCES (= arc où elles ont été forgées), pas un défaut à 1 :
        // sans ça, la fiche affichait le bonus 2 pièces à l'échelle de l'arc 1
        // (ex. +150 PV) alors que le combat le lit correctement mis à l'échelle
        // de l'arc des pièces (+150 × 16 en arc 2 — cf. `tierGearMult`), MULTIPLIÉ
        // par le facteur ×4 des PV héros (`HERO_HP_SCALE`). Sur un healer portant
        // la Parure de la Main Secourable (bonus2 hp=150) en arc 2, l'écart à lui
        // seul valait déjà +9000 PV oubliés sur la fiche.
        const setBonus = computeSetBonuses(setIds, h.class_id, equippedSetTier(equipped));
        const bonuses = {
          atk: equipped.reduce((s, it) => s + (it?.atk_bonus ?? 0), 0) + setBonus.atk,
          def: equipped.reduce((s, it) => s + (it?.def_bonus ?? 0), 0) + setBonus.def,
          hp: equipped.reduce((s, it) => s + (it?.hp_bonus ?? 0), 0) + setBonus.hp,
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
        const skills = (h.skills ?? {}) as LearnedSkills;
        // Les compétences n'accordent que des effets spéciaux (pas de stat brute) :
        // les stats effectives ne dépendent que du niveau, de l'inné, de l'équipement
        // et de l'allocation historique.
        const innateBase = {
          hp: Math.max(1, cls.base_hp + innate.bonus_hp),
          atk: Math.max(1, cls.base_atk + innate.bonus_atk),
          def: Math.max(0, cls.base_def + innate.bonus_def),
          speed: Math.max(1, cls.base_speed + innate.bonus_speed),
        };
        const stats = effectiveStats(innateBase, h.level, bonuses, alloc);
        const breakdown = statBreakdown(innateBase, h.level, bonuses, alloc);
        return {
          id: h.id,
          name: h.name,
          classId: h.class_id,
          className: cls.name,
          level: h.level,
          xp: h.xp,
          xpToNext: xpToNextLevel(h.level),
          stats,
          statBreakdown: breakdown,
          power: heroPower(stats),
          statPoints: h.stat_points,
          skillPoints: h.skill_points,
          skills,
          activeSkillId: h.active_skill_id ?? null,
          ultimateSkillId: h.ultimate_skill_id ?? null,
          awakened: h.awakened ?? false,
          runeId: h.rune_id ?? null,
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
          sets: activeSets(setIds, h.class_id, equippedSetTier(equipped)),
          favorite: h.favorite ?? false,
        };
      });
    },
    select: sortHeroes,
  });
}

/**
 * ORDRE CANONIQUE des héros : les FAVORIS d'abord, puis l'ordre historique
 * (ancienneté). Le tri vit ici, sur la requête partagée, et NON dans chaque
 * écran : une vingtaine de listes (carte, donjon, expédition, tour, arène,
 * champ de bataille, boss d'arc, boss de la semaine, pantin, garnison, raid de
 * guilde, taverne, runes, bibliothèque, inventaire…) consomment ce même hook et
 * en héritent d'un coup. Trier écran par écran, c'était garantir d'en oublier.
 *
 * ⚠️ Tri STABLE requis : à favori égal, on doit retrouver exactement l'ordre
 * `created_at, id` renvoyé par la requête. `Array#sort` l'est depuis ES2019.
 */
export function sortHeroes<T extends { favorite: boolean }>(heroes: T[]): T[] {
  return [...heroes].sort((a, b) => Number(b.favorite) - Number(a.favorite));
}

/**
 * Épingle / désépingle un héros (RPC `set_hero_favorite`, SECURITY DEFINER).
 *
 * Mise à jour OPTIMISTE : l'étoile doit répondre au clic, pas après un
 * aller-retour réseau — c'est un geste qu'on répète en enchaînant plusieurs
 * héros. En cas d'échec on remet le cache tel qu'il était.
 */
export function useToggleHeroFavorite() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  const key = heroesQueryKey(userId);

  return useMutation({
    mutationFn: async (args: { heroId: string; favorite: boolean }) => {
      const { error } = await supabase.rpc('set_hero_favorite', {
        p_hero_id: args.heroId,
        p_value: args.favorite,
      });
      if (error) throw error;
    },
    onMutate: async (args) => {
      // Sans ce `cancelQueries`, un refetch déjà en vol pourrait atterrir APRÈS
      // notre écriture optimiste et rétablir l'ancienne étoile.
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<HeroView[]>(key);
      queryClient.setQueryData<HeroView[]>(key, (old) =>
        (old ?? []).map((h) => (h.id === args.heroId ? { ...h, favorite: args.favorite } : h)),
      );
      return { previous };
    },
    onError: (_e, _args, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

/** Longueur max d'un nom de héros (dupliquée dans le RPC `rename_hero`). */
export const HERO_NAME_MAX = 24;

/** Renomme un héros (RPC `rename_hero`, SECURITY DEFINER côté serveur). */
export function useRenameHero() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  return useMutation({
    mutationFn: async (args: { heroId: string; name: string }) => {
      const { error } = await supabase.rpc('rename_hero', {
        p_hero_id: args.heroId,
        p_name: args.name,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: heroesQueryKey(userId) });
      void queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
    },
  });
}

/**
 * Rattrapage d'XP : niveau plafond (5e héros le plus haut) et test par héros.
 * Le calcul est le MÊME que côté serveur (`catchUpCapLevel` partagé) — l'UI ne
 * fait que refléter ce que la fonction edge appliquera réellement.
 */
export function useCatchUpXp(): {
  capLevel: number;
  mult: number;
  isBoosted: (level: number) => boolean;
} {
  const { data: heroes } = useHeroes();
  const capLevel = catchUpCapLevel((heroes ?? []).map((h) => h.level));
  return {
    capLevel,
    mult: CATCH_UP_XP_MULT,
    isBoosted: (level: number) => catchUpXpMult(level, capLevel) > 1,
  };
}
