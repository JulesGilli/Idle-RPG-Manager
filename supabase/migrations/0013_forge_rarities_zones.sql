-- =============================================================================
-- Forge : nouvelle échelle de raretés, tiers, niveaux d'amélioration, matériaux,
-- et extension à 10 zones. Craft/upgrade sont gérés par l'Edge Function `forge`.
-- =============================================================================

-- --- Objets : échelle de raretés + tier + amélioration -----------------------
-- Drop d'abord (l'ancienne contrainte interdirait les nouvelles valeurs).
alter table public.items drop constraint items_rarity_check;
update public.items set rarity = 'uncommon' where rarity = 'rare';
update public.items set rarity = 'advanced' where rarity = 'epic';
alter table public.items add constraint items_rarity_check
  check (rarity in ('poor', 'common', 'uncommon', 'advanced', 'ultimate'));

alter table public.items
  add column tier int not null default 1 check (tier >= 1),
  add column upgrade_level int not null default 0 check (upgrade_level between 0 and 10),
  add column base_atk_bonus int not null default 0,
  add column base_def_bonus int not null default 0,
  add column base_hp_bonus int not null default 0;

-- Les bonus actuels deviennent la base (upgrade 0).
update public.items set
  base_atk_bonus = atk_bonus,
  base_def_bonus = def_bonus,
  base_hp_bonus = hp_bonus;

-- --- Zones : plafond de rareté de drop ---------------------------------------
alter table public.maps add column max_rarity text not null default 'ultimate';
update public.maps set max_rarity = 'uncommon' where id in ('forest', 'caverns');

-- --- 8 nouvelles zones (sort 3..10), difficulté 11..50 -----------------------
insert into public.maps (id, name, sort, accent, theme, resource, boss_resource, max_rarity) values
  ('desert',    'Désert Ardent',     3,  '#f59e0b', 'desert',    'sable_noir',       'oeil_sphinx',       'advanced'),
  ('swamp',     'Marais Putride',    4,  '#65a30d', 'swamp',     'spore',            'coeur_hydre',       'advanced'),
  ('volcano',   'Caldeira',          5,  '#ef4444', 'volcano',   'obsidienne',       'braise_eternelle',  'advanced'),
  ('ruins',     'Ruines Englouties', 6,  '#14b8a6', 'ruins',     'rune',             'fragment_titan',    'ultimate'),
  ('abyss',     'Abysse',            7,  '#3b82f6', 'abyss',     'nacre_noire',      'encre_kraken',      'ultimate'),
  ('sky',       'Cité Céleste',      8,  '#a5b4fc', 'sky',       'plume_orage',      'foudre_condensee',  'ultimate'),
  ('shadow',    'Voile d''Ombre',    9,  '#7c3aed', 'shadow',    'ombre_pure',       'coeur_ombre',       'ultimate'),
  ('celestial', 'Trône Astral',      10, '#eab308', 'celestial', 'poussiere_etoile', 'essence_astrale',   'ultimate')
on conflict (id) do nothing;

-- Niveaux générés (5 par nouvelle zone), stats d'ennemis dérivées de la difficulté.
insert into public.levels (id, map_id, level_index, difficulty, name, is_boss, enemy_config)
select
  m.id || '_' || i,
  m.id,
  i,
  (m.sort - 1) * 5 + i as diff,
  m.name || ' ' || i,
  (i = 5),
  case
    when i = 5 then
      jsonb_build_object('enemies', jsonb_build_array(
        jsonb_build_object(
          'name', m.name || ' — Colosse',
          'hp', 300 + ((m.sort - 1) * 5 + i) * 65,
          'atk', 15 + ((m.sort - 1) * 5 + i) * 3,
          'def', 8 + ((m.sort - 1) * 5 + i),
          'speed', 10 + (((m.sort - 1) * 5 + i) % 5)
        )))
    else
      jsonb_build_object('enemies', jsonb_build_array(
        jsonb_build_object(
          'name', 'Rôdeur',
          'hp', 45 + ((m.sort - 1) * 5 + i) * 16,
          'atk', 6 + ((m.sort - 1) * 5 + i) * 2,
          'def', 2 + ((m.sort - 1) * 5 + i),
          'speed', 9 + (((m.sort - 1) * 5 + i) % 6)
        ),
        jsonb_build_object(
          'name', 'Rôdeur',
          'hp', 45 + ((m.sort - 1) * 5 + i) * 16,
          'atk', 6 + ((m.sort - 1) * 5 + i) * 2,
          'def', 2 + ((m.sort - 1) * 5 + i),
          'speed', 9 + (((m.sort - 1) * 5 + i) % 6)
        )))
  end
from public.maps m
cross join generate_series(1, 5) as i
where m.sort >= 3
on conflict (id) do nothing;
