-- 0092_world_boss.sql — BOSS DE LA SEMAINE (communautaire, immortel).
--
-- Concept : en semaine (lun→ven), un boss COMMUNAUTAIRE et IMMORTEL. Chaque joueur
-- le frappe UNE FOIS PAR JOUR (vrai combat serveur, cf. functions/world-boss). Les
-- dégâts de tous s'additionnent (`total_damage`). À chaque PALIER de dégâts collectifs
-- franchi, une récompense d'or se débloque POUR TOUS les contributeurs (réclamée via
-- l'action `claim`). En fin de semaine (bascule de la clé de semaine ISO), le
-- CLASSEMENT individuel (somme des dégâts) distribue de l'or au top 10 + un TITRE
-- éphémère au 1er (`player_event_titles`, +5 % ATK tant qu'équipé et non expiré).
--
-- Un seul event ACTIF à la fois (une semaine). Création + finalisation LAZY par
-- l'Edge Function (aucun cron) : au premier accès d'une nouvelle semaine, l'event de
-- la semaine passée est finalisé puis le nouveau créé. Toute écriture passe par la
-- fonction (service_role) ; le client ne fait que lire.

-- -----------------------------------------------------------------------------
-- L'event de la semaine (un seul actif à la fois).
-- -----------------------------------------------------------------------------
create table if not exists public.world_boss_events (
  id             uuid primary key default gen_random_uuid(),
  week_key       text not null unique,                     -- clé de semaine ISO Paris, ex. '2026-W29'
  boss_name      text not null,
  boss_combatant jsonb not null,                           -- CombatantInput du « sac de frappe »
  total_damage   bigint not null default 0,               -- dégâts collectifs cumulés
  tiers_unlocked int  not null default 0,                  -- nb de paliers communs déjà franchis
  status         text not null default 'active' check (status in ('active', 'ended')),
  started_at     timestamptz not null default now(),
  ends_at        timestamptz not null,                     -- fin approx. de semaine (affichage)
  ended_at       timestamptz
);
create unique index if not exists world_boss_one_active
  on public.world_boss_events (status) where status = 'active';

-- -----------------------------------------------------------------------------
-- Contributions : 1 frappe / JOUR / joueur (PK event+player+jour).
-- -----------------------------------------------------------------------------
create table if not exists public.world_boss_hits (
  event_id   uuid not null references public.world_boss_events (id) on delete cascade,
  player_id  uuid not null references public.profiles (id) on delete cascade,
  hit_day    text not null,                                -- jour Paris 'YYYY-MM-DD'
  damage     bigint not null default 0,
  created_at timestamptz not null default now(),
  primary key (event_id, player_id, hit_day)               -- ⇒ une frappe max par joueur et par jour
);
create index if not exists world_boss_hits_player_idx
  on public.world_boss_hits (event_id, player_id);         -- somme des dégâts par joueur (classement)

-- -----------------------------------------------------------------------------
-- Paliers COMMUNS (config réutilisée chaque semaine) : seuil de dégâts cumulés →
-- récompense d'or débloquée pour TOUS les contributeurs (réclamée via `claim`).
-- -----------------------------------------------------------------------------
create table if not exists public.world_boss_tier_defs (
  idx        int primary key,                              -- ordre (1,2,3…)
  threshold  bigint not null,                              -- dégâts collectifs requis
  reward     jsonb  not null                               -- ex. {"gold": 5000}
);
insert into public.world_boss_tier_defs (idx, threshold, reward) values
  (1, 5000000,   '{"gold": 5000}'),
  (2, 20000000,  '{"gold": 15000}'),
  (3, 50000000,  '{"gold": 40000}'),
  (4, 150000000, '{"gold": 100000}'),
  (5, 400000000, '{"gold": 250000}')
on conflict (idx) do nothing;

-- -----------------------------------------------------------------------------
-- Réclamations de paliers : quel contributeur a déjà encaissé quel palier.
-- -----------------------------------------------------------------------------
create table if not exists public.world_boss_tier_claims (
  event_id   uuid not null references public.world_boss_events (id) on delete cascade,
  player_id  uuid not null references public.profiles (id) on delete cascade,
  tier_idx   int  not null,
  claimed_at timestamptz not null default now(),
  primary key (event_id, player_id, tier_idx)
);

-- -----------------------------------------------------------------------------
-- Titres de classement à EXPIRATION : donnent un % de stats la semaine suivante.
-- `stat_mult` s'applique à l'ATTAQUE (spec : +5 % ATK au 1er). Écrit par la
-- finalisation hebdo ; lu en combat (application via applyCombatBuff — voir functions).
-- -----------------------------------------------------------------------------
create table if not exists public.player_event_titles (
  player_id  uuid primary key references public.profiles (id) on delete cascade,
  title      text   not null,                              -- ex. 'Fléau de la Semaine'
  stat_mult  numeric not null default 1,                   -- 1.05 = +5 % ATK
  source     text   not null default 'world_boss',
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null                          -- fin de la semaine suivante
);

-- -----------------------------------------------------------------------------
-- Incrément ATOMIQUE du total collectif (évite les pertes en concurrence). Appelé
-- uniquement par l'Edge Function (service_role). Renvoie le nouveau total.
-- -----------------------------------------------------------------------------
create or replace function public.increment_world_boss_damage(p_event_id uuid, p_amount bigint)
returns bigint
language sql
security definer
set search_path = public
as $$
  update public.world_boss_events
     set total_damage = total_damage + greatest(0, p_amount)
   where id = p_event_id and status = 'active'
  returning total_damage;
$$;
revoke all on function public.increment_world_boss_damage(uuid, bigint) from public;

-- Crédit d'or ATOMIQUE (paliers + classement). Réservé à l'Edge Function.
create or replace function public.add_player_gold(p_player uuid, p_amount bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set gold = gold + greatest(0, p_amount) where id = p_player;
$$;
revoke all on function public.add_player_gold(uuid, bigint) from public;

-- -----------------------------------------------------------------------------
-- RLS : lecture publique authentifiée (jauge de dégâts + classement + paliers).
-- Aucune écriture client : seule l'Edge Function `world-boss` (service_role) écrit.
-- -----------------------------------------------------------------------------
alter table public.world_boss_events      enable row level security;
alter table public.world_boss_hits        enable row level security;
alter table public.world_boss_tier_defs   enable row level security;
alter table public.world_boss_tier_claims enable row level security;
alter table public.player_event_titles    enable row level security;

create policy "world_boss_events readable by authenticated"
  on public.world_boss_events for select to authenticated using (true);
create policy "world_boss_hits readable by authenticated"
  on public.world_boss_hits for select to authenticated using (true);
create policy "world_boss_tier_defs readable by authenticated"
  on public.world_boss_tier_defs for select to authenticated using (true);
-- Un joueur ne lit QUE ses propres réclamations et son propre titre.
create policy "world_boss_tier_claims readable by owner"
  on public.world_boss_tier_claims for select to authenticated using (player_id = auth.uid());
create policy "player_event_titles readable by owner"
  on public.player_event_titles for select to authenticated using (player_id = auth.uid());
