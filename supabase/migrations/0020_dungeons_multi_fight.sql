-- 0020_dungeons_multi_fight.sql
-- Donjons multi-combats : un donjon enchaîne 30 à 50 combats consécutifs
-- (monstres normaux, mini-boss, boss final) SANS reset complet des PV entre
-- chaque combat — seulement une regen partielle, statuts temporaires clear.
-- Toute la résolution vit dans /shared (déterministe, seedée) et n'est exécutée
-- QUE côté serveur ; le client ne fait que rejouer le résultat déjà stocké.

-- -----------------------------------------------------------------------------
-- Type de donjon (table de référence, lecture publique authentifiée)
-- -----------------------------------------------------------------------------
create table public.dungeon_types (
  id                       text primary key,
  name                     text not null,
  tier                     int  not null default 1,
  -- séquence ordonnée de combattants : [{ name, hp, atk, def, speed }] (30-50 entrées)
  monster_sequence         jsonb   not null,
  -- PV récupérés entre deux combats, en fraction des PV max (0.10 = +10 %). PAS un reset.
  regen_pct_between_fights numeric not null default 0.10
                             check (regen_pct_between_fights >= 0 and regen_pct_between_fights <= 1),
  -- positions (index 0-based dans monster_sequence)
  miniboss_indices         int[] not null default '{}',
  boss_index               int   not null check (boss_index >= 0),
  -- tables de loot : [{ "resource": <clé player_resources>, "min": int, "max": int, "chance": 0..1 }]
  loot_table_normal        jsonb not null default '[]'::jsonb,
  loot_table_miniboss      jsonb not null default '[]'::jsonb,
  loot_table_boss          jsonb not null default '[]'::jsonb
);

-- -----------------------------------------------------------------------------
-- dungeon_runs : réécriture pour le modèle multi-combats.
-- L'ancienne table (donjon mono-combat) est un proto MORT : aucune référence
-- dans le front, la vue leaderboard (0009) ne l'utilise plus, aucune FK entrante.
-- On la remplace donc à neuf. La table `dungeons` (mono-combat) est CONSERVÉE :
-- `expeditions.dungeon_id` la référence encore.
-- -----------------------------------------------------------------------------
drop table if exists public.dungeon_runs cascade;

create table public.dungeon_runs (
  id              uuid primary key default gen_random_uuid(),
  player_id       uuid not null references public.profiles (id) on delete cascade,
  dungeon_type_id text not null references public.dungeon_types (id),
  hero_ids        uuid[]  not null,
  seed            bigint  not null,           -- seed serveur (jamais fournie par le client)
  result          jsonb   not null,           -- simulation complète (fightResults) pour le replay
  success         boolean not null,
  reached_index   int     not null,
  created_at      timestamptz not null default now()
);

create index dungeon_runs_player_id_idx       on public.dungeon_runs (player_id);
create index dungeon_runs_dungeon_type_id_idx on public.dungeon_runs (dungeon_type_id);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.dungeon_types enable row level security;
alter table public.dungeon_runs  enable row level security;

-- Types de donjon : lisibles par tout utilisateur authentifié (convention projet
-- pour les tables de référence : dungeons, maps, levels, hero_classes…).
create policy "dungeon_types readable by authenticated"
  on public.dungeon_types for select to authenticated using (true);

-- Runs : chaque joueur ne lit QUE ses propres runs.
-- AUCUNE policy insert / update / delete → le client ne peut jamais écrire
-- `result`, `success` ni `reached_index`. Seule la Edge Function resolve-dungeon-run
-- (service_role, bypass RLS) insère un run.
create policy "dungeon_runs select own"
  on public.dungeon_runs for select to authenticated
  using ((select auth.uid()) = player_id);
