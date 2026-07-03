-- 0026_guild_system.sql
-- Système de GUILDES : guildes (nom/tag/emblème, XP/niveau), membres & rôles,
-- RAIDS de guilde (mise en commun de héros via hero_loans, résolus en une seule
-- simulation serveur en réutilisant simulateDungeonRun), classement & flux
-- d'activité. Conventions : *_player_id -> profiles(id), PK text pour les tables
-- de référence, uuid pour les runs. RLS SELECT-only ; écritures = Edge Functions.

-- -----------------------------------------------------------------------------
-- Guildes
-- -----------------------------------------------------------------------------
create table public.guilds (
  id                uuid primary key default gen_random_uuid(),
  name              text not null unique,
  tag               text not null unique,               -- court, sert à rejoindre
  description       text not null default '',
  emblem            text not null default 'ICON_FantasyWarrior_Map_Flag01', -- icône Synty (cosmétique)
  founder_player_id uuid not null references public.profiles (id) on delete cascade,
  xp                int  not null default 0 check (xp >= 0),      -- monte via les raids
  max_members       int  not null default 20 check (max_members > 0),
  last_raid_at      timestamptz,                                  -- cooldown de raid (guilde)
  created_at        timestamptz not null default now()
);

-- Un joueur = au plus une guilde (player_id en PK).
create table public.guild_members (
  player_id     uuid primary key references public.profiles (id) on delete cascade,
  guild_id      uuid not null references public.guilds (id) on delete cascade,
  role          text not null default 'member' check (role in ('founder', 'officer', 'member')),
  contribution  int  not null default 0,                -- points cumulés (classement)
  raids_joined  int  not null default 0,
  joined_at     timestamptz not null default now()
);
create index guild_members_guild_id_idx on public.guild_members (guild_id);

-- -----------------------------------------------------------------------------
-- Types de raid (référence, même forme que dungeon_types → réutilise la sim)
-- -----------------------------------------------------------------------------
create table public.guild_raid_types (
  id                       text primary key,
  name                     text not null,
  tier                     int  not null default 1,
  required_guild_level     int  not null default 1,     -- débloqué selon le niveau de guilde
  min_heroes               int  not null default 5,
  max_heroes               int  not null default 15,
  monster_sequence         jsonb   not null,            -- [{ name, enemies:[{name,hp,atk,def,speed}] }]
  regen_pct_between_fights numeric not null default 0
                             check (regen_pct_between_fights >= 0 and regen_pct_between_fights <= 1),
  miniboss_indices         int[] not null default '{}',
  boss_index               int   not null check (boss_index >= 0),
  loot_table_normal        jsonb not null default '[]'::jsonb,
  loot_table_miniboss      jsonb not null default '[]'::jsonb,
  loot_table_boss          jsonb not null default '[]'::jsonb
);

-- -----------------------------------------------------------------------------
-- Raids : lobby de mise en commun → contributions par membre → run résolu
-- -----------------------------------------------------------------------------
create table public.guild_raid_lobbies (
  id                  uuid primary key default gen_random_uuid(),
  guild_id            uuid not null references public.guilds (id) on delete cascade,
  raid_type_id        text not null references public.guild_raid_types (id),
  created_by_player_id uuid not null references public.profiles (id) on delete cascade,
  status              text not null default 'open' check (status in ('open', 'resolved', 'cancelled')),
  created_at          timestamptz not null default now(),
  expires_at          timestamptz not null
);
create index guild_raid_lobbies_guild_idx on public.guild_raid_lobbies (guild_id, status);

create table public.guild_raid_contributions (
  lobby_id     uuid not null references public.guild_raid_lobbies (id) on delete cascade,
  guild_id     uuid not null references public.guilds (id) on delete cascade, -- dénormalisé pour la RLS
  player_id    uuid not null references public.profiles (id) on delete cascade,
  hero_ids     uuid[] not null,
  committed_at timestamptz not null default now(),
  primary key (lobby_id, player_id)
);

create table public.guild_raid_runs (
  id                    uuid primary key default gen_random_uuid(),
  guild_id              uuid not null references public.guilds (id) on delete cascade,
  raid_type_id          text not null references public.guild_raid_types (id),
  started_by_player_id  uuid not null references public.profiles (id) on delete cascade,
  hero_ids              uuid[] not null,
  participant_player_ids uuid[] not null,
  seed                  bigint  not null,               -- seed serveur
  result                jsonb   not null,               -- simulation complète (replay)
  success               boolean not null,
  reached_index         int     not null,
  created_at            timestamptz not null default now()
);
create index guild_raid_runs_guild_idx on public.guild_raid_runs (guild_id);

-- -----------------------------------------------------------------------------
-- Flux d'activité (lecture seule ; écrit par les Edge Functions)
-- -----------------------------------------------------------------------------
create table public.guild_events (
  id               uuid primary key default gen_random_uuid(),
  guild_id         uuid not null references public.guilds (id) on delete cascade,
  kind             text not null,        -- create|join|leave|kick|promote|demote|raid_clear|raid_fail
  actor_player_id  uuid references public.profiles (id) on delete set null,
  message          text not null,
  meta             jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);
create index guild_events_guild_idx on public.guild_events (guild_id, created_at desc);

-- -----------------------------------------------------------------------------
-- hero_loans : le raid réutilise ce système pour agréger les héros des membres.
-- -----------------------------------------------------------------------------
alter table public.hero_loans drop constraint if exists hero_loans_activity_type_check;
alter table public.hero_loans
  add constraint hero_loans_activity_type_check
  check (activity_type in ('expedition', 'dungeon', 'raid'));

-- -----------------------------------------------------------------------------
-- Helper : appartenance à une guilde (SECURITY DEFINER → évite la récursion RLS
-- quand une policy interroge guild_members). Créé APRÈS les tables.
-- -----------------------------------------------------------------------------
create or replace function public.is_guild_member(gid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.guild_members
    where guild_id = gid and player_id = (select auth.uid())
  );
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.guilds                   enable row level security;
alter table public.guild_members            enable row level security;
alter table public.guild_raid_types         enable row level security;
alter table public.guild_raid_lobbies       enable row level security;
alter table public.guild_raid_contributions enable row level security;
alter table public.guild_raid_runs          enable row level security;
alter table public.guild_events             enable row level security;

-- Public (authentifié) : parcourir guildes, rosters et catalogue de raids.
create policy "guilds readable"        on public.guilds            for select to authenticated using (true);
create policy "guild_members readable" on public.guild_members     for select to authenticated using (true);
create policy "raid_types readable"    on public.guild_raid_types  for select to authenticated using (true);

-- Réservé aux membres de la guilde (via helper security-definer, pas de récursion).
create policy "raid_lobbies members"   on public.guild_raid_lobbies       for select to authenticated using (public.is_guild_member(guild_id));
create policy "raid_contribs members"  on public.guild_raid_contributions for select to authenticated using (public.is_guild_member(guild_id));
create policy "raid_runs members"      on public.guild_raid_runs          for select to authenticated using (public.is_guild_member(guild_id));
create policy "guild_events members"   on public.guild_events             for select to authenticated using (public.is_guild_member(guild_id));

-- -----------------------------------------------------------------------------
-- Classement de guilde (vue agrégée, comme la leaderboard existante)
-- -----------------------------------------------------------------------------
create view public.guild_leaderboard
with (security_invoker = false)
as
with member_stats as (
  select guild_id, count(*) as members, coalesce(sum(contribution), 0) as contribution
  from public.guild_members group by guild_id
),
raid_stats as (
  select guild_id, count(*) filter (where success) as raids_cleared
  from public.guild_raid_runs group by guild_id
)
select
  g.id as guild_id,
  g.name,
  g.tag,
  g.emblem,
  g.xp,
  coalesce(ms.members, 0)        as members,
  coalesce(ms.contribution, 0)   as contribution,
  coalesce(rs.raids_cleared, 0)  as raids_cleared
from public.guilds g
left join member_stats ms on ms.guild_id = g.id
left join raid_stats   rs on rs.guild_id = g.id;

grant select on public.guild_leaderboard to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Seed : 1 raid de test « Le Colosse d'Ossements » (12 vagues, packs, boss final)
-- -----------------------------------------------------------------------------
insert into public.guild_raid_types (
  id, name, tier, required_guild_level, min_heroes, max_heroes,
  monster_sequence, regen_pct_between_fights, miniboss_indices, boss_index,
  loot_table_normal, loot_table_miniboss, loot_table_boss
)
select
  'raid_colosse',
  'Le Colosse d''Ossements',
  1, 1, 5, 15,
  (
    with counts as (
      select i, 3 + (i % 3) as n from generate_series(0, 11) as i
    ),
    packs as (
      select c.i, jsonb_agg(jsonb_build_object(
        'name', 'Guerrier squelette',
        'hp', 220 + c.i * 25, 'atk', 22 + c.i * 2, 'def', 6 + c.i, 'speed', 10
      )) as enemies
      from counts c cross join lateral generate_series(1, c.n) as gs(k)
      group by c.i
    ),
    fights as (
      select
        p.i,
        case
          when p.i = 11 then jsonb_build_object(
            'name', 'Le Colosse d''Ossements',
            'enemies', jsonb_build_array(
              jsonb_build_object('name','Colosse d''Ossements','hp',6000,'atk',70,'def',30,'speed',12),
              jsonb_build_object('name','Bras du Colosse','hp',900,'atk',48,'def',18,'speed',14),
              jsonb_build_object('name','Bras du Colosse','hp',900,'atk',48,'def',18,'speed',14),
              jsonb_build_object('name','Culte squelette','hp',500,'atk',40,'def',10,'speed',18),
              jsonb_build_object('name','Culte squelette','hp',500,'atk',40,'def',10,'speed',18)
            )
          )
          when p.i = 5 then jsonb_build_object(
            'name', 'Gardien du Colosse',
            'enemies', jsonb_build_array(
              jsonb_build_object('name','Gardien du Colosse','hp',1600,'atk',44,'def',20,'speed',12),
              jsonb_build_object('name','Ossuaire animé','hp',400,'atk',30,'def',8,'speed',16),
              jsonb_build_object('name','Ossuaire animé','hp',400,'atk',30,'def',8,'speed',16)
            )
          )
          else jsonb_build_object('name', 'Horde d''ossements', 'enemies', p.enemies)
        end as f
      from packs p
    )
    select jsonb_agg(f order by i) from fights
  ),
  0, array[5], 11,
  '[{"resource":"os_titanesque","weight":60,"min":2,"max":5}]'::jsonb,
  '[{"resource":"os_titanesque","weight":100,"min":4,"max":8},
    {"resource":"insigne_de_guilde","weight":40,"min":1,"max":2}]'::jsonb,
  '[{"resource":"coeur_du_colosse","weight":100,"min":1,"max":1},
    {"resource":"insigne_de_guilde","weight":100,"min":3,"max":6}]'::jsonb;
