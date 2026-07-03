-- 0028_seed_dungeons_tier2_4.sql
-- 3 nouveaux donjons multi-combats, difficulté FORTEMENT croissante (gros gaps) et
-- nombre de vagues variable. Même format que 0023 : chaque vague =
-- { name, enemies:[{name,hp,atk,def,speed}, ...] }, regen 0. Loot = ressources de
-- donjon existantes (ossement / fragment_relique / sceau_catacombe), quantités
-- croissantes → alimentent l'Autel des Reliques.
-- Progression : Catacombes (t1) → Nécropole (t2) → Forteresse (t3) → Abysse (t4).

-- ------------------------------------------------------------------ TIER 2
-- Nécropole des Brumes : 12 vagues, mini-boss idx 5, boss idx 11.
with counts as (select i, 2 + (i % 3) as n from generate_series(0, 11) as i),
packs as (
  select c.i, jsonb_agg(jsonb_build_object(
    'name',  case when c.i % 4 = 3 then 'Spectre' else 'Revenant' end,
    'hp',    200 + c.i * 35, 'atk', 30 + c.i * 4, 'def', 8 + (c.i / 3),
    'speed', case when c.i % 4 = 3 then 13 else 10 end
  )) as enemies
  from counts c cross join lateral generate_series(1, c.n) as gs(k)
  group by c.i
),
fights as (
  select p.i, case
    when p.i = 11 then jsonb_build_object('name', 'La Liche des Brumes', 'enemies', jsonb_build_array(
      jsonb_build_object('name','Liche des Brumes','hp',5200,'atk',110,'def',35,'speed',14),
      jsonb_build_object('name','Spectre gardien','hp',700,'atk',70,'def',18,'speed',16),
      jsonb_build_object('name','Spectre gardien','hp',700,'atk',70,'def',18,'speed',16)))
    when p.i = 5 then jsonb_build_object('name', 'Le Gardien Brumeux', 'enemies', jsonb_build_array(
      jsonb_build_object('name','Gardien Brumeux','hp',2200,'atk',72,'def',26,'speed',11),
      jsonb_build_object('name','Râle-mort','hp',420,'atk',48,'def',12,'speed',13),
      jsonb_build_object('name','Râle-mort','hp',420,'atk',48,'def',12,'speed',13)))
    else jsonb_build_object(
      'name', case when p.i % 4 = 3 then 'Nuée spectrale' else 'Cohorte des brumes' end,
      'enemies', p.enemies)
  end as f
  from packs p
)
insert into public.dungeon_types (
  id, name, tier, monster_sequence, regen_pct_between_fights,
  miniboss_indices, boss_index, loot_table_normal, loot_table_miniboss, loot_table_boss
)
select 'dj_necropole', 'Nécropole des Brumes', 2,
  (select jsonb_agg(f order by i) from fights), 0, array[5], 11,
  '[{"resource":"ossement","min":2,"max":4,"chance":0.6}]'::jsonb,
  '[{"resource":"ossement","min":5,"max":8,"chance":1},{"resource":"fragment_relique","min":1,"max":2,"chance":1}]'::jsonb,
  '[{"resource":"sceau_catacombe","min":1,"max":2,"chance":1},{"resource":"fragment_relique","min":2,"max":3,"chance":1}]'::jsonb
where not exists (select 1 from public.dungeon_types where id = 'dj_necropole');

-- ------------------------------------------------------------------ TIER 3
-- Forteresse de Cendres : 18 vagues, mini-boss idx 8, boss idx 17.
with counts as (select i, 2 + (i % 3) as n from generate_series(0, 17) as i),
packs as (
  select c.i, jsonb_agg(jsonb_build_object(
    'name',  case when c.i % 5 = 4 then 'Zélote ardent' else 'Soldat de cendres' end,
    'hp',    800 + c.i * 90, 'atk', 80 + c.i * 7, 'def', 14 + (c.i / 2),
    'speed', case when c.i % 5 = 4 then 14 else 10 end
  )) as enemies
  from counts c cross join lateral generate_series(1, c.n) as gs(k)
  group by c.i
),
fights as (
  select p.i, case
    when p.i = 17 then jsonb_build_object('name', 'Le Seigneur de Cendres', 'enemies', jsonb_build_array(
      jsonb_build_object('name','Seigneur de Cendres','hp',18000,'atk',280,'def',70,'speed',16),
      jsonb_build_object('name','Colosse ardent','hp',3200,'atk',180,'def',55,'speed',9),
      jsonb_build_object('name','Colosse ardent','hp',3200,'atk',180,'def',55,'speed',9),
      jsonb_build_object('name','Arbalétrier maudit','hp',1400,'atk',210,'def',24,'speed',20)))
    when p.i = 8 then jsonb_build_object('name', 'Le Maître-Flamme', 'enemies', jsonb_build_array(
      jsonb_build_object('name','Maître-Flamme','hp',7800,'atk',180,'def',48,'speed',13),
      jsonb_build_object('name','Molosse de braise','hp',1500,'atk',130,'def',22,'speed',19),
      jsonb_build_object('name','Molosse de braise','hp',1500,'atk',130,'def',22,'speed',19)))
    else jsonb_build_object(
      'name', case when p.i % 5 = 4 then 'Légion ardente' else 'Garnison cendreuse' end,
      'enemies', p.enemies)
  end as f
  from packs p
)
insert into public.dungeon_types (
  id, name, tier, monster_sequence, regen_pct_between_fights,
  miniboss_indices, boss_index, loot_table_normal, loot_table_miniboss, loot_table_boss
)
select 'dj_forteresse', 'Forteresse de Cendres', 3,
  (select jsonb_agg(f order by i) from fights), 0, array[8], 17,
  '[{"resource":"ossement","min":4,"max":7,"chance":0.7},{"resource":"fragment_relique","min":1,"max":1,"chance":0.25}]'::jsonb,
  '[{"resource":"fragment_relique","min":2,"max":3,"chance":1},{"resource":"sceau_catacombe","min":1,"max":1,"chance":0.5}]'::jsonb,
  '[{"resource":"sceau_catacombe","min":2,"max":3,"chance":1},{"resource":"fragment_relique","min":3,"max":5,"chance":1}]'::jsonb
where not exists (select 1 from public.dungeon_types where id = 'dj_forteresse');

-- ------------------------------------------------------------------ TIER 4
-- Abysse du Dévoreur : 10 vagues brutales, mini-boss idx 4, boss idx 9.
with counts as (select i, 2 + (i % 2) as n from generate_series(0, 9) as i),
packs as (
  select c.i, jsonb_agg(jsonb_build_object(
    'name',  case when c.i % 3 = 2 then 'Horreur abyssale' else 'Rampant du vide' end,
    'hp',    3200 + c.i * 500, 'atk', 220 + c.i * 25, 'def', 40 + c.i,
    'speed', case when c.i % 3 = 2 then 15 else 11 end
  )) as enemies
  from counts c cross join lateral generate_series(1, c.n) as gs(k)
  group by c.i
),
fights as (
  select p.i, case
    when p.i = 9 then jsonb_build_object('name', 'Le Dévoreur', 'enemies', jsonb_build_array(
      jsonb_build_object('name','Le Dévoreur','hp',65000,'atk',720,'def',150,'speed',18),
      jsonb_build_object('name','Tentacule abyssal','hp',9000,'atk',420,'def',90,'speed',12),
      jsonb_build_object('name','Tentacule abyssal','hp',9000,'atk',420,'def',90,'speed',12),
      jsonb_build_object('name','Œil du vide','hp',4000,'atk',560,'def',40,'speed',24)))
    when p.i = 4 then jsonb_build_object('name', 'La Gueule Béante', 'enemies', jsonb_build_array(
      jsonb_build_object('name','Gueule Béante','hp',28000,'atk',460,'def',110,'speed',14),
      jsonb_build_object('name','Rejeton du vide','hp',5500,'atk',300,'def',50,'speed',20),
      jsonb_build_object('name','Rejeton du vide','hp',5500,'atk',300,'def',50,'speed',20)))
    else jsonb_build_object(
      'name', case when p.i % 3 = 2 then 'Marée abyssale' else 'Horde du vide' end,
      'enemies', p.enemies)
  end as f
  from packs p
)
insert into public.dungeon_types (
  id, name, tier, monster_sequence, regen_pct_between_fights,
  miniboss_indices, boss_index, loot_table_normal, loot_table_miniboss, loot_table_boss
)
select 'dj_abysse', 'Abysse du Dévoreur', 4,
  (select jsonb_agg(f order by i) from fights), 0, array[4], 9,
  '[{"resource":"fragment_relique","min":1,"max":2,"chance":0.5},{"resource":"ossement","min":6,"max":10,"chance":1}]'::jsonb,
  '[{"resource":"fragment_relique","min":3,"max":4,"chance":1},{"resource":"sceau_catacombe","min":1,"max":2,"chance":1}]'::jsonb,
  '[{"resource":"sceau_catacombe","min":3,"max":5,"chance":1},{"resource":"fragment_relique","min":5,"max":8,"chance":1}]'::jsonb
where not exists (select 1 from public.dungeon_types where id = 'dj_abysse');
