-- 0126_finale_zone11.sql
-- La Zone 11 (Arc 2) : le gauntlet final. 2 vagues de gardiens de plus en plus
-- dures, puis le boss unique « L'Aube Première » (stun + AOE périodique + enrage
-- = effet de phases). Débloqué après la zone 10, VISIBLE en Arc 2 seulement
-- (maps.min_arc). Battre le boss une 1re fois déclenche les crédits (flag profil).

alter table public.maps add column if not exists min_arc int not null default 1;
alter table public.profiles add column if not exists finale_cleared_at timestamptz;

insert into public.maps (id, name, sort, accent, theme, resource, boss_resource, max_rarity, min_arc)
values ('finale', 'L''Aube Première', 11, '#ffd27a', 'celestial', 'poussiere_etoile', 'essence_astrale', 'ultimate', 2)
on conflict (id) do update set
  name = excluded.name, sort = excluded.sort, accent = excluded.accent, theme = excluded.theme,
  resource = excluded.resource, boss_resource = excluded.boss_resource,
  max_rarity = excluded.max_rarity, min_arc = excluded.min_arc;

insert into public.levels (id, map_id, level_index, difficulty, name, is_boss, enemy_config) values
  -- Calibre UN CRAN au-dessus du dernier donjon d'Arc 2 (tier 8 : boss ~1,43 M PV
  -- / 46,8 k ATK effectifs en arc 2). Stats de BASE ici, ×22 PV / ×26 ATK en arc 2.
  ('finale_1', 'finale', 1, 54, 'Les Sentinelles du Seuil', false,
   '{"enemies":[
      {"name":"Sentinelle du Seuil","hp":28000,"atk":950,"def":120,"armor":70,"speed":13,"abilities":[{"kind":"on_hit","chance":0.18,"status":"weaken","potency":0.15,"duration":2}]},
      {"name":"Sentinelle du Seuil","hp":28000,"atk":950,"def":120,"armor":70,"speed":13,"abilities":[{"kind":"on_hit","chance":0.18,"status":"weaken","potency":0.15,"duration":2}]}
    ]}'::jsonb),
  ('finale_2', 'finale', 2, 56, 'Les Hérauts de l''Aube', false,
   '{"enemies":[
      {"name":"Héraut de l''Aube","hp":30000,"atk":1150,"def":140,"armor":78,"speed":12,"abilities":[{"kind":"on_hit","chance":0.16,"status":"stun","duration":1}]},
      {"name":"Héraut de l''Aube","hp":30000,"atk":1150,"def":140,"armor":78,"speed":12,"abilities":[{"kind":"on_hit","chance":0.16,"status":"stun","duration":1}]},
      {"name":"Héraut de l''Aube","hp":30000,"atk":1150,"def":140,"armor":78,"speed":12,"abilities":[{"kind":"on_hit","chance":0.16,"status":"stun","duration":1}]}
    ]}'::jsonb),
  ('finale_3', 'finale', 3, 58, 'L''Aube Première', true,
   '{"enemies":[
      {"name":"L''Aube Première","hp":95000,"atk":1850,"def":180,"armor":95,"speed":11,"abilities":[
        {"kind":"on_hit","chance":0.2,"status":"stun","duration":1},
        {"kind":"autocast","everyRounds":3,"action":{"type":"aoe","spread":false,"status":"burn","dmgMult":1.7,"statusChance":1,"statusPotency":0.14,"statusDuration":3}},
        {"kind":"atk_ramp","perTurn":0.06}
      ]}
    ]}'::jsonb)
on conflict (id) do update set
  map_id = excluded.map_id, level_index = excluded.level_index, difficulty = excluded.difficulty,
  name = excluded.name, is_boss = excluded.is_boss, enemy_config = excluded.enemy_config;
