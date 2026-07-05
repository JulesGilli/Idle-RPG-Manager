-- 0034_zone_narrative_names.sql
-- IMMERSION : renomme les 50 étapes (10 zones × 5) pour raconter une aventure
-- continue. Fil rouge : une étoile déchue a déchiré le voile du monde ; l'escouade
-- remonte la corruption, de la forêt brumeuse jusqu'au Trône Astral. Chaque zone
-- est un chapitre, l'étape 5 en est le boss. Idempotent (UPDATE par id de niveau).

update public.levels as l
set name = v.name
from (values
  -- Chapitre I — Forêt de Brumes : le départ
  ('forest_1',    'Le Sentier des Adieux'),
  ('forest_2',    'La Clairière aux Murmures'),
  ('forest_3',    'Les Ronces Affamées'),
  ('forest_4',    'Les Ruines Moussues'),
  ('forest_5',    'Le Cœur Sylvestre'),

  -- Chapitre II — Cavernes Gelées : sous la terre
  ('caverns_1',   'La Gueule de Givre'),
  ('caverns_2',   'La Galerie des Échos'),
  ('caverns_3',   'Le Lac Figé'),
  ('caverns_4',   'La Faille Sans Fond'),
  ('caverns_5',   'Le Trône de Givre'),

  -- Chapitre III — Désert Ardent : la traversée
  ('desert_1',    'Les Dunes Hurlantes'),
  ('desert_2',    'La Caravane Ensablée'),
  ('desert_3',    'Le Mirage de Verre'),
  ('desert_4',    'La Porte des Sables'),
  ('desert_5',    'L''Œil du Sphinx'),

  -- Chapitre IV — Marais Putride : l'enlisement
  ('swamp_1',     'Les Berges Fétides'),
  ('swamp_2',     'Le Gué des Noyés'),
  ('swamp_3',     'La Tourbière Vorace'),
  ('swamp_4',     'Le Nid de Spores'),
  ('swamp_5',     'La Gueule de l''Hydre'),

  -- Chapitre V — Caldeira : le feu
  ('volcano_1',   'Les Cendres Ardentes'),
  ('volcano_2',   'Le Pont de Lave'),
  ('volcano_3',   'La Forge Éteinte'),
  ('volcano_4',   'Le Souffle du Volcan'),
  ('volcano_5',   'La Braise Éternelle'),

  -- Chapitre VI — Ruines Englouties : les profondeurs oubliées
  ('ruins_1',     'Les Marches Noyées'),
  ('ruins_2',     'La Nef Brisée'),
  ('ruins_3',     'Le Sanctuaire Inondé'),
  ('ruins_4',     'La Salle des Titans'),
  ('ruins_5',     'Le Gardien de Pierre'),

  -- Chapitre VII — Abysse : le grand plongeon
  ('abyss_1',     'Le Seuil des Ténèbres'),
  ('abyss_2',     'Les Récifs Hurlants'),
  ('abyss_3',     'La Fosse Sans Étoiles'),
  ('abyss_4',     'Les Anneaux du Kraken'),
  ('abyss_5',     'L''Étreinte du Kraken'),

  -- Chapitre VIII — Cité Céleste : l'ascension
  ('sky_1',       'Les Escaliers de Nuages'),
  ('sky_2',       'Les Ponts de Lumière'),
  ('sky_3',       'Le Parvis des Vents'),
  ('sky_4',       'La Flèche d''Orage'),
  ('sky_5',       'Le Cœur de la Tempête'),

  -- Chapitre IX — Voile d'Ombre : le seuil interdit
  ('shadow_1',    'La Frontière Estompée'),
  ('shadow_2',    'Le Dédale Sans Reflet'),
  ('shadow_3',    'Les Murmures du Vide'),
  ('shadow_4',    'Le Sanctuaire d''Ombre'),
  ('shadow_5',    'Le Cœur d''Ombre'),

  -- Chapitre X — Trône Astral : la confrontation
  ('celestial_1', 'Le Chemin des Étoiles'),
  ('celestial_2', 'Le Parvis Constellé'),
  ('celestial_3', 'La Voûte Éclatée'),
  ('celestial_4', 'Le Seuil du Trône'),
  ('celestial_5', 'Le Trône Astral')
) as v(id, name)
where l.id = v.id;
