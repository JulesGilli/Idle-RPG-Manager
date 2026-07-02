-- 0021_seed_dungeon_catacombes.sql
-- Premier type de donjon multi-combats : « Catacombes du Roi Déchu » (tier 1).
-- 30 combats mono-monstre, mini-boss à l'index 14, boss final à l'index 29.
-- La séquence est générée (stats croissantes) pour rester compacte et éditable.
-- Loot DÉDIÉ (distinct du loot des zones) : ressources destinées aux futurs
-- sets d'ensemble et reliques (ossement / fragment_relique / sceau_catacombe).

insert into public.dungeon_types (
  id, name, tier,
  monster_sequence, regen_pct_between_fights,
  miniboss_indices, boss_index,
  loot_table_normal, loot_table_miniboss, loot_table_boss
)
select
  'dj_catacombes',
  'Catacombes du Roi Déchu',
  1,
  seq.monster_sequence,
  0.12,                       -- +12 % PV max récupérés entre chaque combat
  array[14],                  -- mini-boss
  29,                         -- boss final
  '[{"resource":"ossement","min":1,"max":2,"chance":0.5}]'::jsonb,
  '[{"resource":"ossement","min":3,"max":5,"chance":1},
    {"resource":"fragment_relique","min":1,"max":1,"chance":1}]'::jsonb,
  '[{"resource":"sceau_catacombe","min":1,"max":1,"chance":1},
    {"resource":"fragment_relique","min":1,"max":2,"chance":1}]'::jsonb
from (
  select jsonb_agg(m order by i) as monster_sequence
  from (
    select
      i,
      case
        when i = 29 then jsonb_build_object(
          'name', 'Roi Déchu', 'hp', 1400, 'atk', 42, 'def', 20, 'speed', 12)
        when i = 14 then jsonb_build_object(
          'name', 'Geôlier des Os', 'hp', 480, 'atk', 28, 'def', 13, 'speed', 10)
        when i % 5 = 4 then jsonb_build_object(
          'name', 'Goule affamée',
          'hp', 90 + i * 6, 'atk', 12 + i, 'def', 4 + (i / 6), 'speed', 9)
        else jsonb_build_object(
          'name', 'Squelette',
          'hp', 60 + i * 5, 'atk', 9 + (i * 2) / 3, 'def', 3 + (i / 8), 'speed', 8)
      end as m
    from generate_series(0, 29) as i
  ) t
) seq;
