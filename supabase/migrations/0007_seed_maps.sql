-- Seed des maps et de leurs 5 niveaux (difficulté croissante). Idempotent.

insert into public.maps (id, name, sort, accent) values
  ('forest',  'Forêt de Brumes',  1, '#22c55e'),
  ('caverns', 'Cavernes Gelées',  2, '#06b6d4')
on conflict (id) do update set name = excluded.name, sort = excluded.sort, accent = excluded.accent;

insert into public.levels (id, map_id, level_index, difficulty, name, enemy_config) values
  ('forest_1', 'forest', 1, 1, 'Sentier boisé',
    '{"enemies":[{"name":"Gobelin","hp":44,"atk":7,"def":2,"speed":9},{"name":"Gobelin","hp":44,"atk":7,"def":2,"speed":9}]}'),
  ('forest_2', 'forest', 2, 2, 'Clairière',
    '{"enemies":[{"name":"Loup","hp":40,"atk":9,"def":2,"speed":13},{"name":"Loup","hp":40,"atk":9,"def":2,"speed":13},{"name":"Loup","hp":40,"atk":9,"def":2,"speed":13}]}'),
  ('forest_3', 'forest', 3, 3, 'Fourré épineux',
    '{"enemies":[{"name":"Ogre","hp":95,"atk":12,"def":5,"speed":6},{"name":"Ogre","hp":95,"atk":12,"def":5,"speed":6}]}'),
  ('forest_4', 'forest', 4, 4, 'Ruines moussues',
    '{"enemies":[{"name":"Bandit","hp":72,"atk":14,"def":4,"speed":11},{"name":"Bandit","hp":72,"atk":14,"def":4,"speed":11},{"name":"Chef bandit","hp":110,"atk":16,"def":6,"speed":10}]}'),
  ('forest_5', 'forest', 5, 5, 'Cœur sylvestre',
    '{"enemies":[{"name":"Ent ancien","hp":270,"atk":19,"def":10,"speed":7}]}'),
  ('caverns_1', 'caverns', 1, 6, 'Entrée glacée',
    '{"enemies":[{"name":"Chauve-souris","hp":72,"atk":15,"def":4,"speed":15},{"name":"Chauve-souris","hp":72,"atk":15,"def":4,"speed":15},{"name":"Chauve-souris","hp":72,"atk":15,"def":4,"speed":15}]}'),
  ('caverns_2', 'caverns', 2, 7, 'Galerie sombre',
    '{"enemies":[{"name":"Troll","hp":165,"atk":19,"def":8,"speed":7},{"name":"Troll","hp":165,"atk":19,"def":8,"speed":7}]}'),
  ('caverns_3', 'caverns', 3, 8, 'Lac gelé',
    '{"enemies":[{"name":"Golem de glace","hp":135,"atk":18,"def":12,"speed":6},{"name":"Golem de glace","hp":135,"atk":18,"def":12,"speed":6},{"name":"Golem de glace","hp":135,"atk":18,"def":12,"speed":6}]}'),
  ('caverns_4', 'caverns', 4, 9, 'Abîme',
    '{"enemies":[{"name":"Wendigo","hp":155,"atk":25,"def":9,"speed":12},{"name":"Wendigo","hp":155,"atk":25,"def":9,"speed":12}]}'),
  ('caverns_5', 'caverns', 5, 10, 'Trône de givre',
    '{"enemies":[{"name":"Dragon de givre","hp":430,"atk":31,"def":15,"speed":11}]}')
on conflict (id) do update set
  map_id = excluded.map_id,
  level_index = excluded.level_index,
  difficulty = excluded.difficulty,
  name = excluded.name,
  enemy_config = excluded.enemy_config;
