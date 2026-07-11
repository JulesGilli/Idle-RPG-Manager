-- 0057_guild_skill_tree.sql
-- Progression de guilde : 10 niveaux de raid progressifs (même raid, de plus en
-- plus dur) + arbre de compétences de guilde.
--
-- `highest_raid_cleared` : plus haut niveau de raid battu (0..10). Le raid joué est
--   toujours le niveau juste au-dessus ; à la victoire on l'incrémente (source des
--   « points de raid »). Écrit uniquement par le service_role (edge function).
-- `skill_alloc` : répartition des points dans l'arbre (jsonb), ex.
--   { "atk": 3, "hp": 1, "crit_chance": 5 }. Les POINTS disponibles ne sont pas
--   stockés : ils se déduisent (raid = highest_raid_cleared − points de base ;
--   niveau = niveau de guilde − points avancés). Écrit par le service_role.

alter table public.guilds
  add column if not exists highest_raid_cleared int   not null default 0,
  add column if not exists skill_alloc          jsonb not null default '{}'::jsonb;

-- Garde-fou : le plus haut niveau battu reste dans [0, 10]. Idempotent (le
-- déploiement passe par l'API : on évite un échec si la migration est rejouée).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'guilds_highest_raid_cleared_range'
  ) then
    alter table public.guilds
      add constraint guilds_highest_raid_cleared_range
      check (highest_raid_cleared >= 0 and highest_raid_cleared <= 10);
  end if;
end $$;

-- Les colonnes sont en lecture pour les membres via les policies SELECT existantes
-- de `guilds` ; toute mutation passe par les edge functions (service_role).
