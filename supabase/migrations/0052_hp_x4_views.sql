-- 0052_hp_x4_views.sql
-- Rééquilibrage : les PV effectifs des héros sont ×4 (formulas.HERO_HP_SCALE).
-- On répercute ce ×4 sur les vues d'affichage (fiche joueur + classement) pour
-- qu'elles collent aux PV réels montrés sur la feuille de héros.

create or replace view public.leaderboard
with (security_invoker = false)
as
with hero_stats as (
  select
    h.owner_id, h.level,
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
),
hero_power as (
  select
    owner_id,
    (round(base_atk * (1 + 0.05 * (level - 1))) + atk_bonus + alloc_atk * 2) * 2
    + (round(base_def * (1 + 0.05 * (level - 1))) + def_bonus + alloc_def * 2) * 2
    + (round(base_hp  * (1 + 0.05 * (level - 1))) + hp_bonus  + alloc_hp  * 8) * 4 * 0.5
    + (base_speed + alloc_speed) as power
  from hero_stats
),
ranked as (
  select owner_id, power, row_number() over (partition by owner_id order by power desc) as rn
  from hero_power
),
player_power as (
  select owner_id, sum(power)::int as total_power
  from ranked where rn <= 5
  group by owner_id
),
player_levels as (
  select lp.player_id, count(*) as levels_cleared, coalesce(max(l.difficulty), 0) as max_difficulty
  from public.level_progress lp
  join public.levels l on l.id = lp.level_id
  group by lp.player_id
)
select
  p.id as player_id, p.display_name,
  coalesce(pp.total_power, 0) as total_power,
  coalesce(pl.levels_cleared, 0::bigint) as levels_cleared,
  coalesce(pl.max_difficulty, 0) as max_difficulty,
  p.gold
from public.profiles p
left join player_power pp on pp.owner_id = p.id
left join player_levels pl on pl.player_id = p.id;

grant select on public.leaderboard to anon, authenticated;

create or replace view public.hero_public
with (security_invoker = false)
as
with hero_stats as (
  select
    h.owner_id, h.id, h.name, h.class_id, h.level,
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
  owner_id, id, name, class_id, level,
  (round(base_atk * (1 + 0.05 * (level - 1))) + atk_bonus + alloc_atk * 2)::int as atk,
  (round(base_def * (1 + 0.05 * (level - 1))) + def_bonus + alloc_def * 2)::int as def,
  ((round(base_hp * (1 + 0.05 * (level - 1))) + hp_bonus + alloc_hp * 8) * 4)::int as hp,
  (base_speed + alloc_speed)::int as speed,
  (
    (round(base_atk * (1 + 0.05 * (level - 1))) + atk_bonus + alloc_atk * 2) * 2
    + (round(base_def * (1 + 0.05 * (level - 1))) + def_bonus + alloc_def * 2) * 2
    + (round(base_hp  * (1 + 0.05 * (level - 1))) + hp_bonus  + alloc_hp  * 8) * 4 * 0.5
    + (base_speed + alloc_speed)
  )::int as power
from hero_stats;

grant select on public.hero_public to anon, authenticated;
