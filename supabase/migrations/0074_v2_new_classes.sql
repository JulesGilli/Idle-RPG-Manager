-- =============================================================================
-- 0074_v2_new_classes.sql
-- V2 — Ajout des 3 nouvelles classes + renommage du Soigneur en « Oracle ».
--
-- ⚠️ VAGUE 2 / JOUR J UNIQUEMENT. Ne PAS appliquer en prod avant le lancement V2 :
-- dès que ces lignes existent, `forcedTavernClasses` (garantie « une de chaque »)
-- réserve des slots de Taverne pour ces classes chez TOUS les joueurs → fuite V2.
-- Cf. docs/refonte-v2.md §11, §13.
--
-- Stats de base (hp, atk, def, speed) — points de départ, à affiner avec `npm run sim` :
--   voleur       : DPS léger « glass cannon », le plus rapide (dague, physique).
--   necromancien : caster invocateur robuste, poids moyen (faux, magique).
--   inquisiteur  : gros DPS bruiser lourd (grande épée, physique).
-- Idempotent : réappliquer met à jour sans dupliquer.
-- =============================================================================

insert into public.hero_classes (id, name, base_hp, base_atk, base_def, base_speed, weight) values
  ('voleur',       'Voleur',        72,  17, 4, 15, 'light'),
  ('necromancien', 'Nécromancien', 100,  15, 8,  8, 'medium'),
  ('inquisiteur',  'Inquisiteur',  120,  17, 9,  7, 'heavy')
on conflict (id) do update set
  name       = excluded.name,
  base_hp    = excluded.base_hp,
  base_atk   = excluded.base_atk,
  base_def   = excluded.base_def,
  base_speed = excluded.base_speed,
  weight     = excluded.weight;

-- Renommage V2 : le Soigneur devient l'« Oracle » (id inchangé → aucune donnée à migrer).
update public.hero_classes set name = 'Oracle' where id = 'soigneur';

-- Aligne la colonne `weight` (legacy, l'équip passe par CLASS_ALLOWED_WEIGHTS côté code)
-- sur les règles V2 (1 poids/classe) pour cohérence de la donnée.
update public.hero_classes set weight = 'heavy'  where id in ('paladin', 'inquisiteur');
update public.hero_classes set weight = 'medium' where id in ('guerrier', 'necromancien');
update public.hero_classes set weight = 'light'  where id in ('archer', 'voleur', 'mage', 'soigneur');
