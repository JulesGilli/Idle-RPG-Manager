-- 0024_expeditions_system.sql
-- Système d'EXPÉDITIONS : déploiements idle de plusieurs heures qui rapportent
-- des matériaux uniques (indisponibles sur la Carte / dans les Donjons).
--
-- Convention projet (validée) :
--   - ownership = player_id -> profiles(id) (pas user_id/auth.users) ;
--   - PK text lisible pour la table de référence (comme dungeons/dungeon_types) ;
--   - dispo des héros DÉRIVÉE de l'appartenance à une expedition_runs 'in_progress'
--     (aucune colonne heroes.status) ;
--   - RLS SELECT-only : toutes les écritures passent par les Edge Functions
--     (service_role). Le client ne peut jamais insérer/modifier ces tables.
--
-- L'ancien proto `expeditions` (0005) est laissé en place (inoffensif, non branché).

-- -----------------------------------------------------------------------------
-- Types d'expédition (référence, lecture publique authentifiée)
-- -----------------------------------------------------------------------------
create table public.expedition_types (
  id                    text primary key,
  name                  text not null,
  min_level_required    int  not null,
  -- durée de référence (secondes) ; ajustée par computeExpeditionDuration selon
  -- le NIVEAU MINIMUM de l'équipe engagée (/shared).
  duration_base_seconds int  not null check (duration_base_seconds > 0),
  -- pondérations de matériaux uniques :
  -- [{ "resource": <clé player_resources>, "weight": int>0, "min": int, "max": int }]
  loot_table            jsonb not null default '[]'::jsonb
);

-- -----------------------------------------------------------------------------
-- Runs d'expédition
-- -----------------------------------------------------------------------------
create table public.expedition_runs (
  id                 uuid primary key default gen_random_uuid(),
  player_id          uuid not null references public.profiles (id) on delete cascade,
  expedition_type_id text not null references public.expedition_types (id),
  hero_ids           uuid[] not null,
  seed               bigint not null,            -- seed serveur (jamais fournie par le client)
  started_at         timestamptz not null default now(),
  ends_at            timestamptz not null,
  status             text not null default 'in_progress'
                       check (status in ('in_progress', 'claimed')),
  claimed_at         timestamptz
);

create index expedition_runs_player_id_idx on public.expedition_runs (player_id);
-- Recherche rapide des expéditions actives (verrou de dispo des héros + claim).
create index expedition_runs_active_idx
  on public.expedition_runs (player_id)
  where status = 'in_progress';

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.expedition_types enable row level security;
alter table public.expedition_runs  enable row level security;

-- Types : lisibles par tout utilisateur authentifié (convention des tables de référence).
create policy "expedition_types readable by authenticated"
  on public.expedition_types for select to authenticated using (true);

-- Runs : chaque joueur ne lit QUE ses propres runs.
-- AUCUNE policy insert/update/delete → le client ne peut jamais écrire seed/status/
-- ends_at. Seules les Edge Functions (service_role, bypass RLS) écrivent.
create policy "expedition_runs select own"
  on public.expedition_runs for select to authenticated
  using ((select auth.uid()) = player_id);

-- -----------------------------------------------------------------------------
-- Seed : 3 types d'expédition de test (matériaux uniques)
-- -----------------------------------------------------------------------------
insert into public.expedition_types (id, name, min_level_required, duration_base_seconds, loot_table)
values
  (
    'exp_foret_fossile',
    'Forêt Fossile',
    3,
    3 * 3600, -- 3 h de référence
    '[{"resource":"seve_primordiale","weight":60,"min":2,"max":5},
      {"resource":"ambre_vivant","weight":25,"min":1,"max":3},
      {"resource":"coeur_sylve_ancien","weight":8,"min":1,"max":1}]'::jsonb
  ),
  (
    'exp_ruines_englouties',
    'Ruines Englouties',
    6,
    5 * 3600, -- 5 h
    '[{"resource":"poussiere_arcane","weight":55,"min":2,"max":6},
      {"resource":"tablette_oubliee","weight":25,"min":1,"max":2},
      {"resource":"relique_noyee","weight":8,"min":1,"max":1}]'::jsonb
  ),
  (
    'exp_mines_abyssales',
    'Mines Abyssales',
    10,
    8 * 3600, -- 8 h
    '[{"resource":"minerai_stellaire","weight":50,"min":2,"max":6},
      {"resource":"gemme_brute","weight":28,"min":1,"max":3},
      {"resource":"eclat_du_noyau","weight":7,"min":1,"max":1}]'::jsonb
  );
