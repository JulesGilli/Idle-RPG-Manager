-- =============================================================================
--  reset_for_launch_v2.sql  —  REMISE À ZÉRO DE LA PROGRESSION (lancement V2)
-- =============================================================================
--  ⚠️  DESTRUCTIF ET IRRÉVERSIBLE. À exécuter UNE SEULE FOIS, au lancement V2.
--  ⚠️  NE PAS mettre ce fichier dans supabase/migrations/ (il se rejouerait à
--      chaque déploiement). Il vit à la racine supabase/ exprès.
--
--  Mode (identique à V1) : ON GARDE LES COMPTES (auth.users + pseudo), on VIDE
--  toute la progression. Chaque joueur repart à zéro avec 1 Guerrier « Garde » +
--  500 or, exactement comme un nouveau compte.
--
--  ORDRE DE BASCULE (cf. docs/refonte-v2.md §13-14) :
--    1. Fenêtre de maintenance annoncée (app_config release_at).
--    2. Appliquer les migrations comportementales V2 (0074 classes, + celle qui
--       recrée equip_item avec les poids 1/classe = migration 0078, cf. §11).
--       Les migrations additives (0075 blessing, 0076 pantin, 0077 title) peuvent
--       déjà être en prod (Vague 1).
--    3. Exécuter CE script (Supabase → SQL Editor → Run).
--    4. Déployer les fonctions edge V2 (8 combat + recruit + forge + skills +
--       daily-dummy + titles).
--    5. Flip release_at → le front V2 s'ouvre.
--
--  APRÈS : les codes promo restent valides et redeviennent réclamables
--  (redeem_claims vidé). Les nouvelles classes deviennent recrutables ; le cap
--  d'effectif repart à 5 (dungeon_runs vidé → 0 donjon terminé → maxRosterFor=5).
-- =============================================================================

begin;

-- 1) Purge de toutes les tables de PROGRESSION par joueur.
--    (l'ordre importe peu : CASCADE règle les dépendances entre ces tables.)
truncate table
  public.heroes,
  public.items,
  public.dungeon_runs,
  public.dungeon_cooldowns,       -- V2 (cooldowns de donjon par joueur)
  public.player_resources,
  public.level_progress,
  public.deployments,
  public.tavern_state,
  public.tower_progress,
  public.tower_runs,
  public.class_tower_progress,    -- V2 (tours par classe, migration 0067)
  public.expedition_runs,
  public.daily_claims,
  public.redeem_claims,
  public.arena_entries,
  public.team_presets,
  public.hero_loans,
  public.garrison_borrow_usage,
  public.chat_messages,
  public.pantin_runs,             -- V2 (activité journalière du pantin)
  public.player_arc,              -- V2 (New Game+ : arc courant du joueur)
  public.player_arc_progress,     -- V2 (boss d'arc battus par joueur)
  public.arc_event_hits,          -- V2 (coups portés à l'event d'arc)
  -- Guilde (structures + raids + garnison partagée)
  public.guild_garrison,
  public.guild_events,
  public.guild_raid_runs,
  public.guild_raid_contributions,
  public.guild_raid_enrollments,
  public.guild_raid_lobbies,
  public.guild_members,
  public.guilds
  restart identity cascade;

-- 2) Réinitialise les colonnes de progression des profils (on garde id + pseudo).
--    V2 : on remet aussi le TITRE équipé à null (succès à re-débloquer).
update public.profiles
  set gold       = 500,
      account_xp = 0,
      has_lost   = false,
      title      = null;
-- Option (décommente si tu veux reforcer le tutoriel/onboarding V2 pour tous) :
--    , tuto_done = false

-- 3) Ré-octroie le héros de départ à chaque compte (comme handle_new_user).
insert into public.heroes (owner_id, class_id, name)
select id, 'guerrier', 'Garde'
from public.profiles;

-- On NE touche PAS : auth.users, profiles.display_name, ni les tables de CONTENU
-- statique (hero_classes, maps, levels, dungeons, dungeon_types, expeditions,
-- expedition_types, arc_bosses, arc_events, arc_world, guild_raid_types,
-- app_config, redeem_codes…).

commit;

-- Vérifs rapides (à lancer séparément APRÈS le COMMIT) :
--   select count(*) as profils, sum(gold) as or_total from public.profiles;
--   select count(*) as heros from public.heroes;               -- = nb de profils
--   select count(*) as items,
--          (select count(*) from public.level_progress) as prog,
--          (select count(*) from public.player_arc)     as arcs,
--          (select count(*) from public.pantin_runs)    as pantin
--     from public.items;                                        -- attendus : 0 / 0 / 0 / 0
--   select count(*) as titres_equipes from public.profiles where title is not null; -- 0
