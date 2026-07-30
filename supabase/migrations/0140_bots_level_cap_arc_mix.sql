-- 0140_bots_level_cap_arc_mix.sql
-- Bots : corrige deux réglages.
--   1. Niveau de héros plafonné à MAX_LEVEL = 40 (les bots montaient jusqu'à 95,
--      impossible en jeu).
--   2. ~80 % des bots en ARC 1, ~20 % en arc 2 (au lieu de ~50/50).
--
-- On repart d'une répartition propre (hero_level 8→40, avancement carte étalé avec
-- 80 % ≤ 53 = arc 1), on PURGE les level_progress + player_arc des bots (pour ne
-- pas laisser de lignes arc-2 orphelines), puis on ré-applique tout.

-- 1) hero_level (8→40) + avancement carte (80 % arc 1, 20 % arc 2), corrélés.
with ranked as (
  select player_id, row_number() over (order by player_id) as rn, count(*) over () as n
  from public.bot_state
)
update public.bot_state bs set
  hero_level = round(8 + (r.rn - 1) * (40.0 - 8) / greatest(1, r.n - 1))::int,
  levels_cleared = case
    when r.rn <= round(r.n * 0.8)
      then round(5 + (r.rn - 1) * (52.0 - 5) / greatest(1, round(r.n * 0.8) - 1))::int
      else round(56 + (r.rn - round(r.n * 0.8) - 1) * (100.0 - 56)
                 / greatest(1, r.n - round(r.n * 0.8) - 1))::int
  end
from ranked r
where r.player_id = bs.player_id;

-- 2) Cibles : niveau ≤ 40 ; avancement carte ≤ 53 pour les 80 % (ils RESTENT en
--    arc 1), jusqu'à 106 pour les 20 % (ils traversent l'arc 2).
with ranked as (
  select player_id, hero_level, levels_cleared,
         row_number() over (order by player_id) as rn, count(*) over () as n
  from public.bot_state
)
update public.bot_state bs set
  target_level = least(40, greatest(bs.hero_level + 1,
    round(16 + (r.rn - 1) * (40.0 - 16) / greatest(1, r.n - 1))::int)),
  target_zone = case
    when r.rn <= round(r.n * 0.8)
      then least(53, greatest(bs.levels_cleared + 2,
             round(20 + (r.rn - 1) * (53.0 - 20) / greatest(1, round(r.n * 0.8) - 1))::int))
      else least(106, greatest(bs.levels_cleared + 2,
             round(60 + (r.rn - round(r.n * 0.8) - 1) * (106.0 - 60)
                   / greatest(1, r.n - round(r.n * 0.8) - 1))::int))
  end
from ranked r
where r.player_id = bs.player_id;

-- 3) Purge des lignes dérivées des bots (évite les level_progress arc-2 orphelins).
delete from public.level_progress lp
  using public.bot_state bs where lp.player_id = bs.player_id;
delete from public.player_arc pa
  using public.bot_state bs where pa.player_id = bs.player_id;

-- 4) Ré-applique tout (héros au bon niveau, level_progress arc 1/2, player_arc) + arène.
do $$
declare r record;
begin
  for r in select player_id from public.bot_state loop
    perform public.bot_apply(r.player_id);
    perform public.bot_sync_arena(r.player_id);
  end loop;
end $$;
