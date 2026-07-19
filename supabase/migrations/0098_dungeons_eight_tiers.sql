-- 0098_dungeons_eight_tiers.sql
-- Passage de 4 à 8 donjons. La courbe de difficulté est ÉTIRÉE, pas prolongée :
-- l'ancien T1 reste le T1, l'ancien T4 (le plus dur du jeu) devient le T8, et on
-- intercale 4 paliers. Aucun contenu n'est rendu plus dur que ce qui existait.
--
-- Replacement des 4 donjons existants (interpolation linéaire 1→8) :
--   Catacombes  t1 → t1   (inchangé)
--   Nécropole   t2 → t3
--   Forteresse  t3 → t6
--   Abysse      t4 → t8
-- Nouveaux : Ossuaire t2, Sanctuaire t4, Citadelle t5, Faille t7.
--
-- Les stats des 4 nouveaux sont interpolées GÉOMÉTRIQUEMENT entre leurs voisins
-- (les PV de boss vont de 1 400 à 65 000 : une interpolation linéaire aurait
-- écrasé le bas de la courbe). Règles dérivées des seeds existants et conservées :
--   · PV mini-boss ≈ 42 % du boss, ATK mini-boss ≈ 65 % du boss
--   · escortes de mini-boss ≈ 19 % des PV / 67 % de l'ATK de leur mini-boss
--   · escortes de boss     ≈ 13 % des PV / 64 % de l'ATK de leur boss
--   · incrément par vague ≈ 15 % des PV de base, 12 % de l'ATK de base
--
-- Le tier pilote aussi `dungeonCooldownSeconds` et `dungeonDamageMult` côté
-- shared/ : ces deux tables ont été réétirées sur 8 crans dans le même commit.
-- Sans ça, la Forteresse (t3→t6) aurait vu son cooldown passer de 16 h à 19 h et
-- ses dégâts de ×2.0 à ×2.07 — c'est le cas, et c'est volontairement marginal.

-- =========================================================== REPLACEMENT T2→T3
update public.dungeon_types set tier = 3 where id = 'dj_necropole';
update public.dungeon_types set tier = 6 where id = 'dj_forteresse';
update public.dungeon_types set tier = 8 where id = 'dj_abysse';

-- ================================================================== TIER 2 ===
-- Ossuaire des Murmures : 13 vagues, mini-boss idx 6, boss idx 12.
-- Mobs 95+14i PV / 15+2i ATK — entre les Catacombes (45+7i) et la Nécropole (200+35i).
with counts as (select i, 2 + (i % 2) as n from generate_series(0, 12) as i),
packs as (
  select c.i, jsonb_agg(jsonb_build_object(
    'name',  case when c.i % 3 = 2 then 'Murmure' else 'Crâne rampant' end,
    'hp',    95 + c.i * 14, 'atk', 15 + c.i * 2, 'def', 4 + (c.i / 4),
    'speed', case when c.i % 3 = 2 then 12 else 9 end
  )) as enemies
  from counts c cross join lateral generate_series(1, c.n) as gs(k)
  group by c.i
),
fights as (
  select p.i, case
    when p.i = 12 then jsonb_build_object('name', 'Le Chœur d''Ossements', 'enemies', jsonb_build_array(
      jsonb_build_object('name','Chœur d''Ossements','hp',2700,'atk',68,'def',22,'speed',12),
      jsonb_build_object('name','Murmure gardien','hp',350,'atk',44,'def',12,'speed',16),
      jsonb_build_object('name','Murmure gardien','hp',350,'atk',44,'def',12,'speed',16)))
    when p.i = 6 then jsonb_build_object('name', 'Le Veilleur d''Os', 'enemies', jsonb_build_array(
      jsonb_build_object('name','Veilleur d''Os','hp',1130,'atk',44,'def',16,'speed',11),
      jsonb_build_object('name','Chuchoteur','hp',215,'atk',29,'def',8,'speed',13),
      jsonb_build_object('name','Chuchoteur','hp',215,'atk',29,'def',8,'speed',13)))
    else jsonb_build_object(
      'name', case when p.i % 3 = 2 then 'Nuée de murmures' else 'Charnier remué' end,
      'enemies', p.enemies)
  end as f
  from packs p
)
insert into public.dungeon_types (
  id, name, tier, monster_sequence, regen_pct_between_fights,
  miniboss_indices, boss_index, loot_table_normal, loot_table_miniboss, loot_table_boss
)
select 'dj_ossuaire', 'Ossuaire des Murmures', 2,
  (select jsonb_agg(f order by i) from fights), 0, array[6], 12,
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
where not exists (select 1 from public.dungeon_types where id = 'dj_ossuaire');

-- ================================================================== TIER 4 ===
-- Sanctuaire Englouti : 14 vagues, mini-boss idx 6, boss idx 13.
with counts as (select i, 2 + (i % 3) as n from generate_series(0, 13) as i),
packs as (
  select c.i, jsonb_agg(jsonb_build_object(
    'name',  case when c.i % 4 = 3 then 'Gardien corallien' else 'Noyé' end,
    'hp',    320 + c.i * 48, 'atk', 42 + c.i * 5, 'def', 10 + (c.i / 3),
    'speed', case when c.i % 4 = 3 then 12 else 9 end
  )) as enemies
  from counts c cross join lateral generate_series(1, c.n) as gs(k)
  group by c.i
),
fights as (
  select p.i, case
    when p.i = 13 then jsonb_build_object('name', 'La Marée Sans Fond', 'enemies', jsonb_build_array(
      jsonb_build_object('name','Marée Sans Fond','hp',7900,'atk',150,'def',42,'speed',13),
      jsonb_build_object('name','Chant des profondeurs','hp',1030,'atk',96,'def',22,'speed',15),
      jsonb_build_object('name','Chant des profondeurs','hp',1030,'atk',96,'def',22,'speed',15)))
    when p.i = 6 then jsonb_build_object('name', 'Le Prêtre Noyé', 'enemies', jsonb_build_array(
      jsonb_build_object('name','Prêtre Noyé','hp',3320,'atk',98,'def',30,'speed',11),
      jsonb_build_object('name','Acolyte des abysses','hp',630,'atk',65,'def',16,'speed',13),
      jsonb_build_object('name','Acolyte des abysses','hp',630,'atk',65,'def',16,'speed',13)))
    else jsonb_build_object(
      'name', case when p.i % 4 = 3 then 'Récif éveillé' else 'Procession noyée' end,
      'enemies', p.enemies)
  end as f
  from packs p
)
insert into public.dungeon_types (
  id, name, tier, monster_sequence, regen_pct_between_fights,
  miniboss_indices, boss_index, loot_table_normal, loot_table_miniboss, loot_table_boss
)
select 'dj_sanctuaire', 'Sanctuaire Englouti', 4,
  (select jsonb_agg(f order by i) from fights), 0, array[6], 13,
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
where not exists (select 1 from public.dungeon_types where id = 'dj_sanctuaire');

-- ================================================================== TIER 5 ===
-- Citadelle de Rouille : 16 vagues, mini-boss idx 7, boss idx 15.
with counts as (select i, 2 + (i % 3) as n from generate_series(0, 15) as i),
packs as (
  select c.i, jsonb_agg(jsonb_build_object(
    'name',  case when c.i % 4 = 3 then 'Forgeron damné' else 'Automate rouillé' end,
    'hp',    500 + c.i * 75, 'atk', 58 + c.i * 7, 'def', 12 + (c.i / 2),
    'speed', case when c.i % 4 = 3 then 11 else 8 end
  )) as enemies
  from counts c cross join lateral generate_series(1, c.n) as gs(k)
  group by c.i
),
fights as (
  select p.i, case
    when p.i = 15 then jsonb_build_object('name', 'Le Colosse de Rouille', 'enemies', jsonb_build_array(
      jsonb_build_object('name','Colosse de Rouille','hp',11900,'atk',205,'def',50,'speed',11),
      jsonb_build_object('name','Sentinelle grinçante','hp',1550,'atk',131,'def',26,'speed',15),
      jsonb_build_object('name','Sentinelle grinçante','hp',1550,'atk',131,'def',26,'speed',15)))
    when p.i = 7 then jsonb_build_object('name', 'Le Maître de Forge', 'enemies', jsonb_build_array(
      jsonb_build_object('name','Maître de Forge','hp',5000,'atk',133,'def',36,'speed',10),
      jsonb_build_object('name','Marteleur','hp',950,'atk',89,'def',20,'speed',13),
      jsonb_build_object('name','Marteleur','hp',950,'atk',89,'def',20,'speed',13)))
    else jsonb_build_object(
      'name', case when p.i % 4 = 3 then 'Atelier en furie' else 'Colonne de rouille' end,
      'enemies', p.enemies)
  end as f
  from packs p
)
insert into public.dungeon_types (
  id, name, tier, monster_sequence, regen_pct_between_fights,
  miniboss_indices, boss_index, loot_table_normal, loot_table_miniboss, loot_table_boss
)
select 'dj_citadelle', 'Citadelle de Rouille', 5,
  (select jsonb_agg(f order by i) from fights), 0, array[7], 15,
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
where not exists (select 1 from public.dungeon_types where id = 'dj_citadelle');

-- ================================================================== TIER 7 ===
-- Faille du Vide : 12 vagues, mini-boss idx 5, boss idx 11. Peu de vagues mais
-- très dures — même profil « sprint » que l'Abysse qui la suit.
with counts as (select i, 2 + (i % 2) as n from generate_series(0, 11) as i),
packs as (
  select c.i, jsonb_agg(jsonb_build_object(
    'name',  case when c.i % 3 = 2 then 'Marcheur du Vide' else 'Éclat du Vide' end,
    'hp',    1600 + c.i * 240, 'atk', 133 + c.i * 16, 'def', 24 + c.i,
    'speed', case when c.i % 3 = 2 then 14 else 10 end
  )) as enemies
  from counts c cross join lateral generate_series(1, c.n) as gs(k)
  group by c.i
),
fights as (
  select p.i, case
    when p.i = 11 then jsonb_build_object('name', 'La Gueule du Vide', 'enemies', jsonb_build_array(
      jsonb_build_object('name','Gueule du Vide','hp',34000,'atk',450,'def',66,'speed',13),
      jsonb_build_object('name','Écho du néant','hp',4400,'atk',288,'def',45,'speed',16),
      jsonb_build_object('name','Écho du néant','hp',4400,'atk',288,'def',45,'speed',16)))
    when p.i = 5 then jsonb_build_object('name', 'Le Hérault du Vide', 'enemies', jsonb_build_array(
      jsonb_build_object('name','Hérault du Vide','hp',14300,'atk',293,'def',55,'speed',12),
      jsonb_build_object('name','Fragment errant','hp',2700,'atk',195,'def',30,'speed',14),
      jsonb_build_object('name','Fragment errant','hp',2700,'atk',195,'def',30,'speed',14)))
    else jsonb_build_object(
      'name', case when p.i % 3 = 2 then 'Marche du néant' else 'Pluie d''éclats' end,
      'enemies', p.enemies)
  end as f
  from packs p
)
insert into public.dungeon_types (
  id, name, tier, monster_sequence, regen_pct_between_fights,
  miniboss_indices, boss_index, loot_table_normal, loot_table_miniboss, loot_table_boss
)
select 'dj_faille', 'Faille du Vide', 7,
  (select jsonb_agg(f order by i) from fights), 0, array[5], 11,
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
where not exists (select 1 from public.dungeon_types where id = 'dj_faille');

-- =============================================================== TABLES DE LOOT
-- Réécrites pour les 8 donjons d'un bloc, pour que la courbe soit lisible d'un
-- coup d'œil plutôt qu'éparpillée entre 4 migrations. Étirement des mêmes bornes :
-- le T1 et le T8 gardent EXACTEMENT le butin de l'ancien T1 et de l'ancien T4.
--
-- Transition volontaire sur le mini-boss : l'ossement (matériau de base) porte
-- les tiers 1→5 puis s'efface au profit du fragment de relique à partir du T6 —
-- c'est la règle qu'appliquaient déjà les seeds d'origine, simplement réétirée.
update public.dungeon_types d set
  loot_table_normal   = v.normal::jsonb,
  loot_table_miniboss = v.miniboss::jsonb,
  loot_table_boss     = v.boss::jsonb
from (values
  ('dj_catacombes',
   '[{"resource":"ossement","min":1,"max":2,"chance":0.5}]',
   '[{"resource":"ossement","min":3,"max":5,"chance":1},{"resource":"fragment_relique","min":1,"max":1,"chance":1}]',
   '[{"resource":"sceau_catacombe","min":1,"max":1,"chance":1},{"resource":"fragment_relique","min":1,"max":2,"chance":1},{"resource":"larme_astrale","min":0,"max":1,"chance":1}]'),
  ('dj_ossuaire',
   '[{"resource":"ossement","min":1,"max":3,"chance":0.55}]',
   '[{"resource":"ossement","min":4,"max":6,"chance":1},{"resource":"fragment_relique","min":1,"max":1,"chance":1}]',
   '[{"resource":"sceau_catacombe","min":1,"max":1,"chance":1},{"resource":"fragment_relique","min":2,"max":2,"chance":1},{"resource":"larme_astrale","min":1,"max":1,"chance":1}]'),
  ('dj_necropole',
   '[{"resource":"ossement","min":2,"max":4,"chance":0.6}]',
   '[{"resource":"ossement","min":5,"max":8,"chance":1},{"resource":"fragment_relique","min":1,"max":2,"chance":1}]',
   '[{"resource":"sceau_catacombe","min":1,"max":2,"chance":1},{"resource":"fragment_relique","min":2,"max":3,"chance":1},{"resource":"larme_astrale","min":1,"max":2,"chance":1}]'),
  ('dj_sanctuaire',
   '[{"resource":"ossement","min":3,"max":5,"chance":0.63}]',
   '[{"resource":"ossement","min":6,"max":9,"chance":1},{"resource":"fragment_relique","min":2,"max":2,"chance":1}]',
   '[{"resource":"sceau_catacombe","min":2,"max":2,"chance":1},{"resource":"fragment_relique","min":3,"max":4,"chance":1},{"resource":"larme_astrale","min":2,"max":2,"chance":1}]'),
  ('dj_citadelle',
   '[{"resource":"ossement","min":3,"max":6,"chance":0.66},{"resource":"fragment_relique","min":1,"max":1,"chance":0.15}]',
   '[{"resource":"ossement","min":7,"max":10,"chance":1},{"resource":"fragment_relique","min":2,"max":3,"chance":1},{"resource":"sceau_catacombe","min":1,"max":1,"chance":0.25}]',
   '[{"resource":"sceau_catacombe","min":2,"max":3,"chance":1},{"resource":"fragment_relique","min":3,"max":4,"chance":1},{"resource":"larme_astrale","min":2,"max":3,"chance":1}]'),
  ('dj_forteresse',
   '[{"resource":"ossement","min":4,"max":7,"chance":0.7},{"resource":"fragment_relique","min":1,"max":1,"chance":0.25}]',
   '[{"resource":"fragment_relique","min":2,"max":3,"chance":1},{"resource":"sceau_catacombe","min":1,"max":1,"chance":0.5}]',
   '[{"resource":"sceau_catacombe","min":2,"max":3,"chance":1},{"resource":"fragment_relique","min":3,"max":5,"chance":1},{"resource":"larme_astrale","min":2,"max":3,"chance":1}]'),
  ('dj_faille',
   '[{"resource":"ossement","min":5,"max":8,"chance":0.85},{"resource":"fragment_relique","min":1,"max":1,"chance":0.35}]',
   '[{"resource":"fragment_relique","min":3,"max":4,"chance":1},{"resource":"sceau_catacombe","min":1,"max":1,"chance":0.75}]',
   '[{"resource":"sceau_catacombe","min":3,"max":4,"chance":1},{"resource":"fragment_relique","min":4,"max":6,"chance":1},{"resource":"larme_astrale","min":3,"max":3,"chance":1}]'),
  ('dj_abysse',
   '[{"resource":"fragment_relique","min":1,"max":2,"chance":0.5},{"resource":"ossement","min":6,"max":10,"chance":1}]',
   '[{"resource":"fragment_relique","min":3,"max":4,"chance":1},{"resource":"sceau_catacombe","min":1,"max":2,"chance":1}]',
   '[{"resource":"sceau_catacombe","min":3,"max":5,"chance":1},{"resource":"fragment_relique","min":5,"max":8,"chance":1},{"resource":"larme_astrale","min":3,"max":4,"chance":1}]')
) as v(id, normal, miniboss, boss)
where d.id = v.id;
