-- LE GAUNTLET : mode de combat SANS FIN (vagues), escouade de 5 héros. Tentatives
-- illimitées ; on ne retient que la MEILLEURE vague atteinte. Cette meilleure vague
-- fixe une PRODUCTION QUOTIDIENNE d'Éclat d'Éternité (`eclat_eternite`), l'unique
-- ressource qui améliore les armes divines (renforcement à 100 %, cf. forge).
--
-- Les écritures passent EXCLUSIVEMENT par l'Edge Function `gauntlet` (service_role,
-- anti-triche). RLS : chaque joueur ne LIT que ses propres lignes, aucune écriture
-- directe. Idempotent (ré-exécutable via SQL Editor).

-- Progression + ancre de la rente d'Éclat d'Éternité.
create table if not exists public.gauntlet_progress (
  player_id            uuid primary key references public.profiles (id) on delete cascade,
  best_wave            int         not null default 0,
  -- Ancre de production : le temps écoulé depuis cette date × la rente (fonction du
  -- best_wave) donne l'Éclat à créditer. Avancée à chaque encaissement.
  eternity_last_claim_at timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Historique des courses (une ligne par course résolue) — replay / audit.
create table if not exists public.gauntlet_runs (
  id           uuid primary key default gen_random_uuid(),
  player_id    uuid not null references public.profiles (id) on delete cascade,
  hero_ids     jsonb  not null,            -- escouade engagée (jusqu'à 5)
  seed         bigint not null,            -- seed serveur (jamais fournie par le client)
  reached_wave int    not null,
  result       jsonb  not null,            -- waveResults, pour le replay
  created_at   timestamptz not null default now()
);

create index if not exists gauntlet_runs_player_id_idx on public.gauntlet_runs (player_id);

-- -----------------------------------------------------------------------------
-- RLS : lecture de ses propres lignes uniquement. AUCUNE policy insert/update/
-- delete → seule la fonction `gauntlet` (service_role, bypass RLS) écrit.
-- -----------------------------------------------------------------------------
alter table public.gauntlet_progress enable row level security;
alter table public.gauntlet_runs     enable row level security;

drop policy if exists "gauntlet_progress select own" on public.gauntlet_progress;
create policy "gauntlet_progress select own"
  on public.gauntlet_progress for select to authenticated
  using ((select auth.uid()) = player_id);

drop policy if exists "gauntlet_runs select own" on public.gauntlet_runs;
create policy "gauntlet_runs select own"
  on public.gauntlet_runs for select to authenticated
  using ((select auth.uid()) = player_id);
