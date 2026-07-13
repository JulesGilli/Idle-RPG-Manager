-- =============================================================================
-- 0079_awaken_runes.sql
-- V2 — Éveil des héros + Runes (end-game, cf. docs/refonte-v2.md §12).
-- ADDITIF → sûr en Vague 1 (invisible tant que le front V2 n'est pas ouvert et que
-- la ressource `larme_astrale` ne droppe pas). Mutations via service_role only.
-- =============================================================================

-- Éveil : un héros S niveau max peut être éveillé → débloque son slot de rune.
alter table public.heroes
  add column if not exists awakened boolean not null default false;

-- Runes possédées par le joueur : chacune scelle l'effet 2-pièces d'un set.
create table if not exists public.runes (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  set_id     text not null,
  created_at timestamptz not null default now()
);

alter table public.runes enable row level security;
create policy "runes readable by owner"
  on public.runes for select to authenticated
  using (owner_id = auth.uid());

-- Rune équipée d'un héros (slot unique, réservé aux héros éveillés). Si la rune est
-- supprimée, le héros la perd simplement (set null).
alter table public.heroes
  add column if not exists rune_id uuid references public.runes (id) on delete set null;
