-- =============================================================================
-- 0120_newbie_event.sql
-- Event du NOUVEAU JOUEUR (Arc 1). Une ligne PAR JOUEUR, ouverte au premier
-- chargement post-déploiement pour tout compte encore en Arc 1. Fenêtre de 7
-- jours ; objectifs + barre de progression + paliers (logique dans l'edge
-- function `newbie-event` + shared/progression/newbieEvent.ts).
--
-- Tranche 1 : uniquement le suivi (fenêtre + baseline pantin). Les colonnes de
-- réclamation de récompenses (jetons de choix, prix final) viendront en
-- tranche 3 via une migration additive.
--
-- Mutations via service_role uniquement (edge function). Lecture RLS : le
-- propriétaire seulement.
-- =============================================================================

-- --- Compteur de passages du pantin -----------------------------------------
-- Le pantin ne gardait qu'un flag « fait aujourd'hui » + meilleur score, jamais
-- un nombre de jours joués. L'objectif « pantin sur 5 jours » a besoin d'un
-- compteur durable : incrémenté d'exactement 1 à chaque frappe quotidienne
-- (gate 1×/jour côté daily-dummy, donc jamais 2 fois le même jour). L'event
-- capture ce compteur comme baseline à son ouverture et exige +5.
alter table public.pantin_runs
  add column if not exists days_done int not null default 0;

-- --- Event du nouveau joueur -------------------------------------------------
create table if not exists public.newbie_event (
  player_id       uuid primary key references public.profiles (id) on delete cascade,
  starts_at       timestamptz not null default now(),
  ends_at         timestamptz not null,
  -- Valeur de pantin_runs.days_done à l'ouverture : la progression pantin de
  -- l'event = days_done courant − ce baseline.
  pantin_baseline int not null default 0,
  created_at      timestamptz not null default now()
);

alter table public.newbie_event enable row level security;

create policy "newbie_event readable by owner"
  on public.newbie_event for select to authenticated
  using (player_id = auth.uid());
