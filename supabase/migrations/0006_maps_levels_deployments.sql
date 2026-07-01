-- =============================================================================
-- Refonte : maps → 5 niveaux chacun, déploiements idle auto, progression,
-- ressources de craft, 4 slots d'équipement. Remplace donjons/expéditions.
-- =============================================================================

-- L'ancien système d'expéditions est remplacé par les déploiements.
drop table if exists public.expeditions;

-- --- Référentiels : maps & niveaux ------------------------------------------
create table public.maps (
  id     text primary key,
  name   text not null,
  sort   int  not null,
  accent text not null default '#6366f1'
);

create table public.levels (
  id           text primary key,
  map_id       text not null references public.maps (id),
  level_index  int  not null,          -- 1..5
  difficulty   int  not null,
  name         text not null,
  enemy_config jsonb not null,
  unique (map_id, level_index)
);

-- --- Slots d'équipement supplémentaires -------------------------------------
alter table public.heroes
  add column equipped_jewel_id uuid references public.items (id) on delete set null,
  add column equipped_relic_id uuid references public.items (id) on delete set null;

alter table public.items drop constraint items_item_type_check;
alter table public.items add constraint items_item_type_check
  check (item_type in ('weapon', 'armor', 'jewel', 'relic', 'accessory'));

-- --- Déploiements (groupes de héros sur un niveau) --------------------------
create table public.deployments (
  id               uuid primary key default gen_random_uuid(),
  player_id        uuid not null references public.profiles (id) on delete cascade,
  level_id         text not null references public.levels (id),
  hero_ids         uuid[] not null,
  mode             text not null default 'advance' check (mode in ('advance', 'loop')),
  last_resolved_at timestamptz not null default now(),
  last_combat      jsonb,                       -- dernier combat, pour le replay
  created_at       timestamptz not null default now()
);
create index deployments_player_idx on public.deployments (player_id);

-- --- Progression : niveaux nettoyés (débloqués une fois battus) --------------
create table public.level_progress (
  player_id  uuid not null references public.profiles (id) on delete cascade,
  level_id   text not null references public.levels (id),
  cleared_at timestamptz not null default now(),
  primary key (player_id, level_id)
);

-- --- Ressources de craft ----------------------------------------------------
create table public.player_resources (
  player_id uuid not null references public.profiles (id) on delete cascade,
  resource  text not null,
  amount    int  not null default 0,
  primary key (player_id, resource)
);

-- --- RLS ---------------------------------------------------------------------
alter table public.maps             enable row level security;
alter table public.levels           enable row level security;
alter table public.deployments      enable row level security;
alter table public.level_progress   enable row level security;
alter table public.player_resources enable row level security;

create policy "maps readable"   on public.maps   for select to authenticated using (true);
create policy "levels readable" on public.levels for select to authenticated using (true);

create policy "deployments select own"
  on public.deployments for select to authenticated using ((select auth.uid()) = player_id);
create policy "level_progress select own"
  on public.level_progress for select to authenticated using ((select auth.uid()) = player_id);
create policy "player_resources select own"
  on public.player_resources for select to authenticated using ((select auth.uid()) = player_id);

-- --- Leaderboard : progression basée sur les niveaux nettoyés ----------------
create or replace view public.leaderboard
with (security_invoker = false)
as
with hero_stats as (
  select
    h.owner_id,
    h.level,
    hc.base_hp, hc.base_atk, hc.base_def, hc.base_speed,
    coalesce(w.atk_bonus,0)+coalesce(a.atk_bonus,0)+coalesce(j.atk_bonus,0)+coalesce(r.atk_bonus,0) as atk_bonus,
    coalesce(w.def_bonus,0)+coalesce(a.def_bonus,0)+coalesce(j.def_bonus,0)+coalesce(r.def_bonus,0) as def_bonus,
    coalesce(w.hp_bonus,0) +coalesce(a.hp_bonus,0) +coalesce(j.hp_bonus,0) +coalesce(r.hp_bonus,0)  as hp_bonus
  from public.heroes h
  join public.hero_classes hc on hc.id = h.class_id
  left join public.items w on w.id = h.equipped_weapon_id
  left join public.items a on a.id = h.equipped_armor_id
  left join public.items j on j.id = h.equipped_jewel_id
  left join public.items r on r.id = h.equipped_relic_id
),
hero_power as (
  select
    owner_id,
    round(base_atk*(1+0.05*(level-1))) + atk_bonus as eff_atk,
    round(base_def*(1+0.05*(level-1))) + def_bonus as eff_def,
    round(base_hp *(1+0.05*(level-1))) + hp_bonus  as eff_hp,
    base_speed as eff_speed
  from hero_stats
),
player_power as (
  select owner_id, sum(eff_atk*2 + eff_def*2 + eff_hp*0.5 + eff_speed)::int as total_power
  from hero_power group by owner_id
),
player_levels as (
  select
    lp.player_id,
    count(*) as levels_cleared,
    coalesce(max(l.difficulty), 0) as max_difficulty
  from public.level_progress lp
  join public.levels l on l.id = lp.level_id
  group by lp.player_id
)
select
  p.id as player_id,
  p.display_name,
  coalesce(pp.total_power, 0)     as total_power,
  coalesce(pl.levels_cleared, 0)  as levels_cleared,
  coalesce(pl.max_difficulty, 0)  as max_difficulty,
  p.gold                          as gold
from public.profiles p
left join player_power  pp on pp.owner_id = p.id
left join player_levels pl on pl.player_id = p.id;

grant select on public.leaderboard to anon, authenticated;
