-- =============================================================================
-- Idle-RPG Manager — schéma initial
-- Tables, RLS, trigger d'onboarding, vue publique leaderboard.
-- Posture anti-triche : le client est SELECT-only sur les tables de progression.
-- Toutes les mutations de progression passent par une Edge Function (service role).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Référentiels statiques
-- -----------------------------------------------------------------------------

create table public.hero_classes (
  id         text primary key,          -- 'tank', 'dps', 'healer'
  name       text not null,
  base_hp    int  not null,
  base_atk   int  not null,
  base_def   int  not null,
  base_speed int  not null
);

create table public.dungeons (
  id           text primary key,
  name         text not null,
  difficulty   int  not null,
  enemy_config jsonb not null           -- { "enemies": [{ name, hp, atk, def, speed }] }
);

-- -----------------------------------------------------------------------------
-- Données joueur
-- -----------------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table public.items (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  item_type  text not null check (item_type in ('weapon', 'armor', 'accessory')),
  name       text not null,
  rarity     text not null check (rarity in ('common', 'rare', 'epic')),
  atk_bonus  int  not null default 0,
  def_bonus  int  not null default 0,
  hp_bonus   int  not null default 0,
  created_at timestamptz not null default now()
);

create table public.heroes (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references public.profiles (id) on delete cascade,
  class_id           text not null references public.hero_classes (id),
  name               text not null,
  level              int  not null default 1 check (level >= 1),
  xp                 int  not null default 0 check (xp >= 0),
  equipped_weapon_id uuid references public.items (id) on delete set null,
  equipped_armor_id  uuid references public.items (id) on delete set null,
  created_at         timestamptz not null default now()
);

create table public.dungeon_runs (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references public.profiles (id) on delete cascade,
  dungeon_id text not null references public.dungeons (id),
  hero_ids   uuid[] not null,
  result     text not null check (result in ('win', 'loss')),
  seed       bigint not null,           -- seed PRNG (combat rejouable / testable)
  combat_log jsonb  not null,
  rewards    jsonb,
  created_at timestamptz not null default now()
);

create index heroes_owner_id_idx on public.heroes (owner_id);
create index items_owner_id_idx on public.items (owner_id);
create index dungeon_runs_player_id_idx on public.dungeon_runs (player_id);

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.hero_classes enable row level security;
alter table public.dungeons     enable row level security;
alter table public.profiles     enable row level security;
alter table public.items        enable row level security;
alter table public.heroes       enable row level security;
alter table public.dungeon_runs enable row level security;

-- Référentiels : lecture pour tout utilisateur authentifié.
create policy "hero_classes readable by authenticated"
  on public.hero_classes for select to authenticated using (true);

create policy "dungeons readable by authenticated"
  on public.dungeons for select to authenticated using (true);

-- Profiles : chaque joueur lit/modifie uniquement le sien.
create policy "profiles select own"
  on public.profiles for select to authenticated using ((select auth.uid()) = id);

create policy "profiles update own"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Progression : SELECT-only pour le propriétaire. Aucune écriture client
-- (les mutations passent par l'Edge Function en service_role, qui bypass la RLS).
create policy "heroes select own"
  on public.heroes for select to authenticated using ((select auth.uid()) = owner_id);

create policy "items select own"
  on public.items for select to authenticated using ((select auth.uid()) = owner_id);

create policy "dungeon_runs select own"
  on public.dungeon_runs for select to authenticated using ((select auth.uid()) = player_id);

-- -----------------------------------------------------------------------------
-- Onboarding : à l'inscription, création du profil + escouade de départ (3 héros)
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_name text;
begin
  new_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(split_part(new.email, '@', 1), ''),
    'Commandant'
  );

  insert into public.profiles (id, display_name)
  values (new.id, new_name);

  insert into public.heroes (owner_id, class_id, name)
  values
    (new.id, 'tank',   'Garde'),
    (new.id, 'dps',    'Lame'),
    (new.id, 'healer', 'Aube');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Vue publique leaderboard
-- security_invoker = false : la vue s'exécute avec les droits du propriétaire
-- (postgres) et bypass la RLS des tables sous-jacentes. Elle n'expose QUE des
-- agrégats (display_name + puissance + progression), jamais les lignes brutes.
-- La "puissance" est une approximation informative (croissance +5%/niveau),
-- volontairement découplée de la formule exacte du simulateur de combat.
-- -----------------------------------------------------------------------------

create view public.leaderboard
with (security_invoker = false)
as
with hero_stats as (
  select
    h.owner_id,
    h.level,
    hc.base_hp,
    hc.base_atk,
    hc.base_def,
    hc.base_speed,
    coalesce(w.atk_bonus, 0) + coalesce(a.atk_bonus, 0) as atk_bonus,
    coalesce(w.def_bonus, 0) + coalesce(a.def_bonus, 0) as def_bonus,
    coalesce(w.hp_bonus, 0)  + coalesce(a.hp_bonus, 0)  as hp_bonus
  from public.heroes h
  join public.hero_classes hc on hc.id = h.class_id
  left join public.items w on w.id = h.equipped_weapon_id
  left join public.items a on a.id = h.equipped_armor_id
),
hero_power as (
  select
    owner_id,
    round(base_atk * (1 + 0.05 * (level - 1))) + atk_bonus as eff_atk,
    round(base_def * (1 + 0.05 * (level - 1))) + def_bonus as eff_def,
    round(base_hp  * (1 + 0.05 * (level - 1))) + hp_bonus  as eff_hp,
    base_speed as eff_speed
  from hero_stats
),
player_power as (
  select
    owner_id,
    sum(eff_atk * 2 + eff_def * 2 + eff_hp * 0.5 + eff_speed)::int as total_power
  from hero_power
  group by owner_id
),
player_runs as (
  select
    dr.player_id,
    count(*) filter (where dr.result = 'win') as dungeons_completed,
    coalesce(max(d.difficulty) filter (where dr.result = 'win'), 0) as max_difficulty
  from public.dungeon_runs dr
  join public.dungeons d on d.id = dr.dungeon_id
  group by dr.player_id
)
select
  p.id as player_id,
  p.display_name,
  coalesce(pp.total_power, 0)        as total_power,
  coalesce(pr.dungeons_completed, 0) as dungeons_completed,
  coalesce(pr.max_difficulty, 0)     as max_difficulty
from public.profiles p
left join player_power pp on pp.owner_id = p.id
left join player_runs  pr on pr.player_id = p.id;

grant select on public.leaderboard to anon, authenticated;
