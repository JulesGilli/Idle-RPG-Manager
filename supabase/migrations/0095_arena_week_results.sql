-- Récompense d'arène : on paie le classement de la semaine ÉCOULÉE, plus celui
-- de la semaine en cours.
--
-- Avant, `claim_weekly` lisait le rang courant : un joueur pouvait s'inscrire et
-- encaisser la récompense de 1re place dans la foulée, sans avoir combattu — et
-- sur un classement d'un seul inscrit, chaque semaine. On fige donc le classement
-- à la clôture de la semaine, et c'est cette photo qui est payée.

create table if not exists public.arena_week_results (
  week         text not null,
  player_id    uuid not null references public.profiles (id) on delete cascade,
  rank         int  not null check (rank >= 1),
  participants int  not null check (participants >= 1),
  wins         int  not null default 0,
  losses       int  not null default 0,
  -- Zone du 1er du classement à la clôture : fige la zone de référence du butin
  -- pour que le montant ne dépende pas de la progression FUTURE du leader.
  leader_zone  int  not null default 1 check (leader_zone >= 1),
  claimed_at   timestamptz,
  created_at   timestamptz not null default now(),
  primary key (week, player_id)
);

create index if not exists arena_week_results_player_idx
  on public.arena_week_results (player_id, week desc);

alter table public.arena_week_results enable row level security;

-- Lecture par le propriétaire ; toutes les écritures passent par la fonction edge
-- en service_role (aucune policy insert/update/delete).
drop policy if exists "arena_week_results readable by owner" on public.arena_week_results;
create policy "arena_week_results readable by owner"
  on public.arena_week_results for select to authenticated
  using (player_id = (select auth.uid()));

comment on table public.arena_week_results is
  'Photo du classement d''arene a la cloture de chaque semaine. Source de verite des recompenses hebdo.';
