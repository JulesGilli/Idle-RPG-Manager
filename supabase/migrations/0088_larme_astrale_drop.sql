-- LA LARME ASTRALE TOMBE ENFIN.
--
-- Elle ne droppait de NULLE PART — les migrations 0075 (bénédiction) et 0079
-- (runes) le notaient explicitement comme un état temporaire. Résultat : trois
-- systèmes entiers étaient injouables faute de robinet — la bénédiction d'arme,
-- l'éveil des héros (3 larmes) et le craft de runes (2 larmes).
--
-- Elle tombe sur le BOSS DU T4 (Abysse du Dévoreur) et nulle part ailleurs :
--  · c'est le seul donjon d'endgame, et il n'avait rien à offrir que les
--    fragments/sceaux déjà donnés par les trois autres — il a enfin une raison
--    d'exister ;
--  · 35 % sur un cooldown de 24 h ≈ une larme tous les 3 jours : la rareté que
--    le lore promet (« ressource ULTRA-RARE », cf. blessing.ts), sans ouvrir
--    les vannes.
--
-- Première entrée de loot du jeu avec une `chance` < 1 : toutes les tables
-- existantes sont à 1 (drop garanti). Le champ existait depuis le début
-- (LootEntry.chance) et ne servait à rien.
update public.dungeon_types
set loot_table_boss = loot_table_boss || jsonb_build_array(
  jsonb_build_object('resource', 'larme_astrale', 'min', 1, 'max', 1, 'chance', 0.35)
)
where id = 'dj_abysse'
  and not (loot_table_boss @> '[{"resource":"larme_astrale"}]'::jsonb);
