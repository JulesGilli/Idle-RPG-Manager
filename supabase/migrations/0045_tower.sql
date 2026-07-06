-- La Tour : activité SOLO à étages, difficulté croissante, matériaux de base
-- gagnés une seule fois par étage. On stocke le meilleur étage atteint par joueur
-- (progression) + l'historique des montées (replay/audit). Les écritures passent
-- exclusivement par l'Edge Function resolve-tower (service_role, anti-triche).

-- Meilleur étage franchi par joueur (0 = jamais grimpé).
create table public.tower_progress (
  player_id  uuid primary key references public.profiles (id) on delete cascade,
  best_floor int not null default 0,
  updated_at timestamptz not null default now()
);

-- Historique des montées (une ligne par montée résolue).
create table public.tower_runs (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references public.profiles (id) on delete cascade,
  hero_id       uuid not null references public.heroes (id) on delete cascade,
  seed          bigint  not null,          -- seed serveur (jamais fournie par le client)
  from_floor    int     not null,
  reached_floor int     not null,
  result        jsonb   not null,          -- fightResults + loot, pour le replay
  created_at    timestamptz not null default now()
);

create index tower_runs_player_id_idx on public.tower_runs (player_id);

-- -----------------------------------------------------------------------------
-- RLS : lecture de ses propres lignes uniquement. AUCUNE policy insert/update/
-- delete → seul resolve-tower (service_role, bypass RLS) écrit.
-- -----------------------------------------------------------------------------
alter table public.tower_progress enable row level security;
alter table public.tower_runs     enable row level security;

create policy "tower_progress select own"
  on public.tower_progress for select to authenticated
  using ((select auth.uid()) = player_id);

create policy "tower_runs select own"
  on public.tower_runs for select to authenticated
  using ((select auth.uid()) = player_id);
