-- 0049_hero_public.sql
-- Fiches personnage publiques : vue SIMPLIFIÉE des héros de TOUS les joueurs, pour
-- consulter le profil d'un joueur depuis le classement. Comme la vue leaderboard,
-- security_invoker = false → s'exécute avec les droits du propriétaire et bypass la
-- RLS (exposition PUBLIQUE volontaire, jeu 100% PvE). N'expose QUE des agrégats
-- simplifiés (classe, niveau, stats effectives, puissance) — jamais l'équipement
-- détaillé, l'arbre de compétences ni les ressources.

create or replace view public.hero_public
with (security_invoker = false)
as
with hero_stats as (
  select
    h.owner_id,
    h.id,
    h.name,
    h.class_id,
    h.level,
    h.alloc_hp, h.alloc_atk, h.alloc_def, h.alloc_speed,
    hc.base_hp, hc.base_atk, hc.base_def, hc.base_speed,
    coalesce(w.atk_bonus, 0) + coalesce(a.atk_bonus, 0) + coalesce(j.atk_bonus, 0) + coalesce(r.atk_bonus, 0) as atk_bonus,
    coalesce(w.def_bonus, 0) + coalesce(a.def_bonus, 0) + coalesce(j.def_bonus, 0) + coalesce(r.def_bonus, 0) as def_bonus,
    coalesce(w.hp_bonus, 0)  + coalesce(a.hp_bonus, 0)  + coalesce(j.hp_bonus, 0)  + coalesce(r.hp_bonus, 0)  as hp_bonus
  from public.heroes h
  join public.hero_classes hc on hc.id = h.class_id
  left join public.items w on w.id = h.equipped_weapon_id
  left join public.items a on a.id = h.equipped_armor_id
  left join public.items j on j.id = h.equipped_jewel_id
  left join public.items r on r.id = h.equipped_relic_id
)
select
  owner_id,
  id,
  name,
  class_id,
  level,
  (round(base_atk * (1 + 0.05 * (level - 1))) + atk_bonus + alloc_atk * 2)::int as atk,
  (round(base_def * (1 + 0.05 * (level - 1))) + def_bonus + alloc_def * 2)::int as def,
  (round(base_hp  * (1 + 0.05 * (level - 1))) + hp_bonus  + alloc_hp  * 8)::int as hp,
  (base_speed + alloc_speed)::int as speed,
  (
    (round(base_atk * (1 + 0.05 * (level - 1))) + atk_bonus + alloc_atk * 2) * 2
    + (round(base_def * (1 + 0.05 * (level - 1))) + def_bonus + alloc_def * 2) * 2
    + (round(base_hp  * (1 + 0.05 * (level - 1))) + hp_bonus  + alloc_hp  * 8) * 0.5
    + (base_speed + alloc_speed)
  )::int as power
from hero_stats;

grant select on public.hero_public to anon, authenticated;
