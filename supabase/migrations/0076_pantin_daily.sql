-- =============================================================================
-- 0076_pantin_daily.sql
-- V2 — Activité journalière « Pantin d'entraînement ». Une ligne par joueur :
-- jour du dernier passage (gate 1×/jour, heure de Paris) + meilleur score.
-- Additive → sûre en Vague 1 (invisible tant que le front V2 n'est pas ouvert).
-- Mutations via service_role uniquement (edge function daily-dummy). Cf. §5 du doc.
-- =============================================================================

create table if not exists public.pantin_runs (
  player_id  uuid primary key references auth.users (id) on delete cascade,
  last_day   text,
  best_score bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.pantin_runs enable row level security;

create policy "pantin_runs readable by owner"
  on public.pantin_runs for select to authenticated
  using (player_id = auth.uid());
