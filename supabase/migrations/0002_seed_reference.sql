-- =============================================================================
-- Seed des référentiels statiques (classes de héros + donjons).
-- Idempotent : réappliquer met à jour les valeurs sans dupliquer.
-- =============================================================================

insert into public.hero_classes (id, name, base_hp, base_atk, base_def, base_speed) values
  ('tank',   'Tank',     120, 8,  10, 6),
  ('dps',    'DPS',      70,  16, 4,  12),
  ('healer', 'Soigneur', 85,  7,  5,  9)
on conflict (id) do update set
  name       = excluded.name,
  base_hp    = excluded.base_hp,
  base_atk   = excluded.base_atk,
  base_def   = excluded.base_def,
  base_speed = excluded.base_speed;

insert into public.dungeons (id, name, difficulty, enemy_config) values
  (
    'd1_gobelins',
    'Clairière des Gobelins',
    1,
    '{"enemies":[
      {"name":"Gobelin","hp":40,"atk":8,"def":2,"speed":9},
      {"name":"Gobelin","hp":40,"atk":8,"def":2,"speed":9}
    ]}'
  ),
  (
    'd2_caverne',
    'Caverne Humide',
    2,
    '{"enemies":[
      {"name":"Rat géant","hp":35,"atk":10,"def":3,"speed":13},
      {"name":"Rat géant","hp":35,"atk":10,"def":3,"speed":13},
      {"name":"Ver des roches","hp":70,"atk":9,"def":6,"speed":5}
    ]}'
  ),
  (
    'd3_crypte',
    'Crypte Oubliée',
    3,
    '{"enemies":[
      {"name":"Squelette","hp":60,"atk":14,"def":7,"speed":10},
      {"name":"Squelette","hp":60,"atk":14,"def":7,"speed":10},
      {"name":"Nécromancien","hp":90,"atk":18,"def":5,"speed":8}
    ]}'
  ),
  (
    'd4_antre',
    'Antre du Dragonnet',
    4,
    '{"enemies":[
      {"name":"Dragonnet","hp":220,"atk":24,"def":12,"speed":11}
    ]}'
  )
on conflict (id) do update set
  name         = excluded.name,
  difficulty   = excluded.difficulty,
  enemy_config = excluded.enemy_config;
