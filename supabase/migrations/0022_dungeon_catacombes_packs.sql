-- 0022_dungeon_catacombes_packs.sql
-- Passe le donjon « Catacombes du Roi Déchu » à des COMBATS DE GROUPE : chaque
-- combat de monster_sequence devient { name, enemies: [...] } (packs de mobs,
-- mini-boss + gardes, boss + escorte) pour de vrais affrontements ~5v5.
-- Le nombre de combats (30), le mini-boss (index 14) et le boss (index 29)
-- restent inchangés — seule la composition de chaque combat évolue.

with counts as (
  select i, 2 + (i / 10) + (i % 2) as n
  from generate_series(0, 29) as i
),
packs as (
  select
    c.i,
    jsonb_agg(
      jsonb_build_object(
        'name',  case when c.i % 5 = 4 then 'Goule' else 'Squelette' end,
        'hp',    (case when c.i % 5 = 4 then 70 else 45 end) + c.i * 4,
        'atk',   (case when c.i % 5 = 4 then 11 else 8 end) + (c.i * 2) / 3,
        'def',   2 + (c.i / 9),
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
      when p.i = 29 then jsonb_build_object(
        'name', 'Le Roi Déchu',
        'enemies', jsonb_build_array(
          jsonb_build_object('name', 'Roi Déchu',       'hp', 1400, 'atk', 42, 'def', 20, 'speed', 12),
          jsonb_build_object('name', 'Garde royal',      'hp', 280,  'atk', 26, 'def', 12, 'speed', 10),
          jsonb_build_object('name', 'Garde royal',      'hp', 280,  'atk', 26, 'def', 12, 'speed', 10),
          jsonb_build_object('name', 'Archer squelette', 'hp', 150,  'atk', 30, 'def', 6,  'speed', 16)
        )
      )
      when p.i = 14 then jsonb_build_object(
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
set monster_sequence = (select jsonb_agg(f order by i) from fights)
where id = 'dj_catacombes';
