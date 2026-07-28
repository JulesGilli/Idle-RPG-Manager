-- 0125_pantheon_pvp.sql
-- Le Panthéon (Arc 2) : PvP par 5 équipes de 3. Échelle par rangs, comme
-- l'arène, mais on affronte les 5 équipes d'un joueur en série (majorité gagne).
-- Tout est calculé côté serveur (service_role) ; le front lit la vue publique.

create table if not exists public.pantheon_entries (
  player_id      uuid primary key references public.profiles (id) on delete cascade,
  rank           int not null,
  -- 5 équipes de 3 : tableau de 5 tableaux d'uuid, stocké en jsonb.
  teams          jsonb not null default '[]',
  -- Snapshots figés des 5 équipes (défense) : CombatantInput[][].
  teams_snapshot jsonb not null default '[]',
  power          int not null default 0,
  wins           int not null default 0,
  losses         int not null default 0,
  active_week    text,
  last_challenge_at timestamptz,
  updated_at     timestamptz not null default now()
);

create index if not exists pantheon_entries_rank_idx on public.pantheon_entries (rank);

alter table public.pantheon_entries enable row level security;
-- Aucune policy : écriture ET lecture via le service_role. Le front lit la vue.

-- Échelle publique (sans les snapshots ni les compos privées).
drop view if exists public.pantheon_ladder;
create view public.pantheon_ladder
with (security_invoker = false)
as
select
  pe.player_id,
  pe.rank,
  p.display_name,
  pe.power,
  pe.wins,
  pe.losses,
  pe.active_week
from public.pantheon_entries pe
join public.profiles p on p.id = pe.player_id;

grant select on public.pantheon_ladder to anon, authenticated;
