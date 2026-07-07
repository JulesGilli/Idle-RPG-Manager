-- 0051_arena_pvp.sql
-- Arène PvP asynchrone : chaque joueur dépose une équipe de défense (snapshot figé).
-- Échelle par rangs ; défier & gagner = échanger de place. Récompense hebdomadaire
-- pull-based (réclamée une fois par semaine ISO). Combats simulés côté serveur.

create table public.arena_entries (
  player_id         uuid primary key references public.profiles (id) on delete cascade,
  rank              int  not null,
  team_hero_ids     uuid[] not null default '{}',
  team_snapshot     jsonb  not null default '[]',   -- CombatantInput[] figé (défense)
  power             int  not null default 0,
  wins              int  not null default 0,
  losses            int  not null default 0,
  active_week       text,                            -- semaine ISO de dernière activité
  last_reward_week  text,                            -- semaine ISO de dernière récompense
  last_challenge_at timestamptz,
  updated_at        timestamptz not null default now()
);

create index arena_entries_rank_idx on public.arena_entries (rank);

alter table public.arena_entries enable row level security;
-- Aucune policy : écriture ET lecture via le service_role (le front lit la vue publique).

-- Échelle publique (sans le snapshot). Comme leaderboard : security_invoker = false.
create view public.arena_ladder
with (security_invoker = false)
as
select
  ae.player_id,
  ae.rank,
  p.display_name,
  ae.power,
  ae.wins,
  ae.losses,
  ae.team_hero_ids,
  ae.active_week
from public.arena_entries ae
join public.profiles p on p.id = ae.player_id;

grant select on public.arena_ladder to anon, authenticated;
