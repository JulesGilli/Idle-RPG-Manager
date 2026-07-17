-- Bestiaire : donne une IDENTITÉ aux monstres des zones 3 à 10.
--
-- Les zones 3-10 (0013) étaient peuplées de « Rôdeur » génériques + un boss
-- « <Zone> — Colosse ». On les nomme, comme les zones 1-2 (cf. 0007/0090) — un
-- monstre thématique par niveau de mob, un vrai nom de boss par zone.
--
-- On ne touche QUE le champ `name` (jsonb_set ciblé) : les stats/l'équilibrage
-- générés par 0013 restent strictement identiques. Idempotent (renommer au même
-- nom est neutre). Les sprites par espèce viendront dans un second temps.

-- Renomme les 2 mobs (index 0 et 1) d'un niveau de carte.
create or replace function pg_temp.name_mobs(p_level text, p_name text) returns void
language sql as $$
  update public.levels
  set enemy_config = jsonb_set(
        jsonb_set(enemy_config, '{enemies,0,name}', to_jsonb(p_name)),
        '{enemies,1,name}', to_jsonb(p_name))
  where id = p_level;
$$;

-- Renomme le boss (index 0) d'un niveau.
create or replace function pg_temp.name_boss(p_level text, p_name text) returns void
language sql as $$
  update public.levels
  set enemy_config = jsonb_set(enemy_config, '{enemies,0,name}', to_jsonb(p_name))
  where id = p_level;
$$;

-- Zone 3 — Désert Ardent
select pg_temp.name_mobs('desert_1', 'Scorpion des sables');
select pg_temp.name_mobs('desert_2', 'Pillard nomade');
select pg_temp.name_mobs('desert_3', 'Serpent de dune');
select pg_temp.name_mobs('desert_4', 'Élémentaire de sable');
select pg_temp.name_boss('desert_5', 'Sphinx de grès');

-- Zone 4 — Marais Putride
select pg_temp.name_mobs('swamp_1', 'Moustique géant');
select pg_temp.name_mobs('swamp_2', 'Sangsue vorace');
select pg_temp.name_mobs('swamp_3', 'Noyé putride');
select pg_temp.name_mobs('swamp_4', 'Crapaud venimeux');
select pg_temp.name_boss('swamp_5', 'Hydre des marais');

-- Zone 5 — Caldeira
select pg_temp.name_mobs('volcano_1', 'Diablotin de braise');
select pg_temp.name_mobs('volcano_2', 'Salamandre de lave');
select pg_temp.name_mobs('volcano_3', 'Chien de cendre');
select pg_temp.name_mobs('volcano_4', 'Élémentaire de magma');
select pg_temp.name_boss('volcano_5', 'Cœur de magma');

-- Zone 6 — Ruines Englouties
select pg_temp.name_mobs('ruins_1', 'Gargouille');
select pg_temp.name_mobs('ruins_2', 'Golem de pierre');
select pg_temp.name_mobs('ruins_3', 'Sentinelle runique');
select pg_temp.name_mobs('ruins_4', 'Statue animée');
select pg_temp.name_boss('ruins_5', 'Titan de pierre');

-- Zone 7 — Abysse
select pg_temp.name_mobs('abyss_1', 'Poisson-lanterne');
select pg_temp.name_mobs('abyss_2', 'Méduse spectrale');
select pg_temp.name_mobs('abyss_3', 'Anguille électrique');
select pg_temp.name_mobs('abyss_4', 'Tentacule abyssal');
select pg_temp.name_boss('abyss_5', 'Kraken');

-- Zone 8 — Cité Céleste
select pg_temp.name_mobs('sky_1', 'Harpie');
select pg_temp.name_mobs('sky_2', 'Gardien ailé');
select pg_temp.name_mobs('sky_3', 'Élémentaire d''orage');
select pg_temp.name_mobs('sky_4', 'Golem de nuage');
select pg_temp.name_boss('sky_5', 'Séraphin déchu');

-- Zone 9 — Voile d'Ombre
select pg_temp.name_mobs('shadow_1', 'Spectre');
select pg_temp.name_mobs('shadow_2', 'Ombre rampante');
select pg_temp.name_mobs('shadow_3', 'Cauchemar');
select pg_temp.name_mobs('shadow_4', 'Revenant');
select pg_temp.name_boss('shadow_5', 'Dévoreur d''ombre');

-- Zone 10 — Trône Astral
select pg_temp.name_mobs('celestial_1', 'Sentinelle astrale');
select pg_temp.name_mobs('celestial_2', 'Écho stellaire');
select pg_temp.name_mobs('celestial_3', 'Archonte mineur');
select pg_temp.name_mobs('celestial_4', 'Gardien du trône');
select pg_temp.name_boss('celestial_5', 'Avatar du Trône');
