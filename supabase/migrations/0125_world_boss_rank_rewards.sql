-- BOSS DE LA SEMAINE — récompenses de CLASSEMENT réclamables.
--
-- Avant : à la finalisation hebdo, l'or/les larmes/l'Éclat sacré du top 10 étaient
-- crédités DIRECTEMENT (en silence) — les joueurs ne voyaient jamais rien arriver.
-- Désormais la finalisation (déclenchée dès l'arrivée du WEEK-END, boss disparu)
-- écrit une ligne EN ATTENTE par joueur classé ; le joueur la réclame via le
-- bouton dédié (action `claim_rank`), signalé par une gommette rouge. Les lignes
-- non réclamées persistent (aucune expiration).
--
-- Écritures via la fonction `world-boss` uniquement (service_role). RLS : chaque
-- joueur ne LIT que ses lignes. Idempotent (ré-exécutable via SQL Editor).

create table if not exists public.world_boss_rank_rewards (
  event_id   uuid not null references public.world_boss_events (id) on delete cascade,
  player_id  uuid not null references public.profiles (id) on delete cascade,
  week_key   text not null,
  boss_name  text not null default '',
  rank       int  not null,
  gold       bigint not null default 0,
  tears      int  not null default 0,
  -- Éclat sacré (matériau de la Forge Sacrée — armure divine), barème top 10.
  eclat      int  not null default 0,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  primary key (event_id, player_id)
);

create index if not exists world_boss_rank_rewards_pending_idx
  on public.world_boss_rank_rewards (player_id) where claimed_at is null;

alter table public.world_boss_rank_rewards enable row level security;

drop policy if exists "world_boss_rank_rewards select own" on public.world_boss_rank_rewards;
create policy "world_boss_rank_rewards select own"
  on public.world_boss_rank_rewards for select to authenticated
  using ((select auth.uid()) = player_id);
