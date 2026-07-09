-- =============================================================================
--  reset_for_launch.sql  —  REMISE À ZÉRO DE LA PROGRESSION (lancement V1)
-- =============================================================================
--  ⚠️  DESTRUCTIF ET IRRÉVERSIBLE. À exécuter UNE SEULE FOIS, au lancement.
--  ⚠️  NE PAS mettre ce fichier dans supabase/migrations/ (il se rejouerait à
--      chaque déploiement). Il vit à la racine supabase/ exprès.
--
--  Mode choisi : ON GARDE LES COMPTES (auth.users + pseudo), on VIDE toute la
--  progression. Chaque joueur repart à zéro avec 1 Guerrier « Garde » + 500 or,
--  exactement comme un nouveau compte.
--
--  À faire AVANT :
--    1. (Recommandé) Sauvegarde/branche de la base au cas où.
--    2. Préviens les joueurs (déconnecte-les si possible).
--  À faire APRÈS :
--    - Les codes de lancement (0059) restent valides et redeviennent réclamables
--      (redeem_claims est vidé).
--    - Le message de bienvenue se ré-affiche côté client (flag welcome-seen-v1) ;
--      si tu veux le reforcer plus tard, bumpe WELCOME_KEY dans UnlockTutorials.
--
--  Exécution : Supabase → SQL Editor → coller ce fichier → Run.
-- =============================================================================

begin;

-- 1) Purge de toutes les tables de progression par joueur (l'ordre importe peu :
--    CASCADE règle les dépendances entre ces tables).
truncate table
  public.heroes,
  public.items,
  public.dungeon_runs,
  public.player_resources,
  public.level_progress,
  public.deployments,
  public.tavern_state,
  public.tower_progress,
  public.tower_runs,
  public.expedition_runs,
  public.player_arc_progress,
  public.daily_claims,
  public.redeem_claims,
  public.arena_entries,
  public.team_presets,
  public.hero_loans,
  public.garrison_borrow_usage,
  public.chat_messages,
  -- Guilde (structures + raids + garnison partagée)
  public.guild_garrison,
  public.guild_events,
  public.guild_raid_runs,
  public.guild_raid_contributions,
  public.guild_raid_lobbies,
  public.guild_members,
  public.guilds
  restart identity cascade;

-- 2) Réinitialise les colonnes de progression des profils (on garde id + pseudo).
update public.profiles
  set gold       = 500,
      account_xp = 0,
      has_lost   = false;

-- 3) Ré-octroie le héros de départ à chaque compte (comme handle_new_user).
insert into public.heroes (owner_id, class_id, name)
select id, 'guerrier', 'Garde'
from public.profiles;

-- On NE touche PAS : auth.users, profiles.display_name, ni les tables de contenu
-- statique (hero_classes, maps, levels, dungeons, expeditions, arc_bosses,
-- guild_raid_types, app_config, redeem_codes…).

commit;

-- Vérifs rapides (à lancer séparément après le COMMIT) :
--   select count(*) as profils, sum(gold) as or_total from public.profiles;
--   select count(*) as heros from public.heroes;               -- = nb de profils
--   select count(*) as items, (select count(*) from public.level_progress) as prog
--     from public.items;                                        -- attendus : 0 / 0
