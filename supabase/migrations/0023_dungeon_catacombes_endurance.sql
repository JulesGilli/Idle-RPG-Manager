-- 0023_dungeon_catacombes_endurance.sql
-- « Catacombes du Roi Déchu » devient un vrai test d'ENDURANCE :
--  - aucune récupération de PV entre les combats (regen_pct = 0) ;
--  - 15 vagues au lieu de 30 (mini-boss au milieu = index 7, boss = index 14).
-- Combats de groupe conservés (packs de mobs, mini-boss + gardes, boss + escorte).

with counts as (
  select i, 2 + (i / 10) + (i % 2) as n
  from generate_series(0, 14) as i
),
packs as (
  select
    c.i,
    jsonb_agg(
      jsonb_build_object(
        'name',  case when c.i % 5 = 4 then 'Goule' else 'Squelette' end,
        'hp',    (case when c.i % 5 = 4 then 70 else 45 end) + c.i * 7,
        'atk',   (case when c.i % 5 = 4 then 11 else 8 end) + c.i,
        'def',   2 + (c.i / 5),
        'speed', case when c.i % 5 = 4 then 10 else 8 end
      )
    ) as enemies
  from counts c
  cross join lateral generate_series(1, c.n) as gs(k)
  group by c.i
),
fights as (
  select
    p.i,
    case
      when p.i = 14 then jsonb_build_object(
        'name', 'Le Roi Déchu',
        'enemies', jsonb_build_array(
          jsonb_build_object('name', 'Roi Déchu',       'hp', 1400, 'atk', 42, 'def', 20, 'speed', 12),
          jsonb_build_object('name', 'Garde royal',      'hp', 280,  'atk', 26, 'def', 12, 'speed', 10),
          jsonb_build_object('name', 'Garde royal',      'hp', 280,  'atk', 26, 'def', 12, 'speed', 10),
          jsonb_build_object('name', 'Archer squelette', 'hp', 150,  'atk', 30, 'def', 6,  'speed', 16)
        )
      )
      when p.i = 7 then jsonb_build_object(
        'name', 'Le Geôlier des Os',
        'enemies', jsonb_build_array(
          jsonb_build_object('name', 'Geôlier des Os', 'hp', 480, 'atk', 28, 'def', 13, 'speed', 10),
          jsonb_build_object('name', 'Chien de garde', 'hp', 120, 'atk', 20, 'def', 5,  'speed', 18),
          jsonb_build_object('name', 'Chien de garde', 'hp', 120, 'atk', 20, 'def', 5,  'speed', 18)
        )
      )
      else jsonb_build_object(
        'name', case when p.i % 5 = 4 then 'Meute de goules' else 'Bande de squelettes' end,
        'enemies', p.enemies
      )
    end as f
  from packs p
)
update public.dungeon_types
set
  monster_sequence = (select jsonb_agg(f order by i) from fights),
  regen_pct_between_fights = 0,
  miniboss_indices = array[7],
  boss_index = 14
where id = 'dj_catacombes';
