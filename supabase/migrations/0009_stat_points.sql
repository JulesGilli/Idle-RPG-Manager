-- =============================================================================
-- Points de stats : chaque niveau gagné octroie des points à répartir dans
-- PV / ATK / DEF / VIT. Attribution côté serveur uniquement (RPC + Edge Function).
-- Barème : 3 points/niveau ; +8 PV, +2 ATK, +2 DEF, +1 VIT par point.
-- =============================================================================

alter table public.heroes
  add column stat_points int not null default 0 check (stat_points >= 0),
  add column alloc_hp    int not null default 0 check (alloc_hp >= 0),
  add column alloc_atk   int not null default 0 check (alloc_atk >= 0),
  add column alloc_def   int not null default 0 check (alloc_def >= 0),
  add column alloc_speed int not null default 0 check (alloc_speed >= 0);

-- Rétroactif : créditer les niveaux déjà acquis (au-delà du niveau 1).
update public.heroes set stat_points = (level - 1) * 3 where level > 1;

-- RPC de dépense d'un point (anti-triche : owner + points dispo vérifiés).
create or replace function public.allocate_stat(p_hero_id uuid, p_stat text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Non authentifié'; end if;
  if p_stat not in ('hp', 'atk', 'def', 'speed') then raise exception 'Stat invalide'; end if;

  update public.heroes set
    stat_points = stat_points - 1,
    alloc_hp    = alloc_hp    + (case when p_stat = 'hp'    then 1 else 0 end),
    alloc_atk   = alloc_atk   + (case when p_stat = 'atk'   then 1 else 0 end),
    alloc_def   = alloc_def   + (case when p_stat = 'def'   then 1 else 0 end),
    alloc_speed = alloc_speed + (case when p_stat = 'speed' then 1 else 0 end)
  where id = p_hero_id and owner_id = v_uid and stat_points > 0;

  if not found then raise exception 'Aucun point à dépenser'; end if;
end;
$$;

revoke execute on function public.allocate_stat(uuid, text) from public, anon;
grant execute on function public.allocate_stat(uuid, text) to authenticated;

-- Leaderboard : intégrer l'allocation dans la puissance.
drop view if exists public.leaderboard;
create view public.leaderboard
with (security_invoker = false)
as
with hero_stats as (
  select
    h.owner_id,
    h.level,
    h.alloc_hp, h.alloc_atk, h.alloc_def, h.alloc_speed,
    hc.base_hp, hc.base_atk, hc.base_def, hc.base_speed,
    coalesce(w.atk_bonus,0)+coalesce(a.atk_bonus,0)+coalesce(j.atk_bonus,0)+coalesce(r.atk_bonus,0) as atk_bonus,
    coalesce(w.def_bonus,0)+coalesce(a.def_bonus,0)+coalesce(j.def_bonus,0)+coalesce(r.def_bonus,0) as def_bonus,
    coalesce(w.hp_bonus,0) +coalesce(a.hp_bonus,0) +coalesce(j.hp_bonus,0) +coalesce(r.hp_bonus,0)  as hp_bonus
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
    round(base_atk*(1+0.05*(level-1))) + atk_bonus + alloc_atk*2 as eff_atk,
    round(base_def*(1+0.05*(level-1))) + def_bonus + alloc_def*2 as eff_def,
    round(base_hp *(1+0.05*(level-1))) + hp_bonus  + alloc_hp*8  as eff_hp,
    base_speed + alloc_speed as eff_speed
  from hero_stats
),
player_power as (
  select owner_id, sum(eff_atk*2 + eff_def*2 + eff_hp*0.5 + eff_speed)::int as total_power
  from hero_power group by owner_id
),
player_levels as (
  select lp.player_id, count(*) as levels_cleared,
    coalesce(max(l.difficulty), 0) as max_difficulty
  from public.level_progress lp
  join public.levels l on l.id = lp.level_id
  group by lp.player_id
)
select
  p.id as player_id,
  p.display_name,
  coalesce(pp.total_power, 0)     as total_power,
  coalesce(pl.levels_cleared, 0)  as levels_cleared,
  coalesce(pl.max_difficulty, 0)  as max_difficulty,
  p.gold                          as gold
from public.profiles p
left join player_power  pp on pp.owner_id = p.id
left join player_levels pl on pl.player_id = p.id;

grant select on public.leaderboard to anon, authenticated;
