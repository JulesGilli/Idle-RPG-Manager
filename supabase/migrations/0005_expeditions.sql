-- =============================================================================
-- Système d'expéditions idle (farm passif).
-- Le joueur assigne une équipe à un donjon ; les récompenses s'accumulent dans
-- le temps et sont calculées CÔTÉ SERVEUR (Edge Function resolve-expedition),
-- jamais côté client. Anti-triche : gold non modifiable par le client.
-- =============================================================================

-- Ressource "or" accumulée passivement.
alter table public.profiles add column gold int not null default 0;

-- Le client ne doit pouvoir modifier QUE display_name (pas gold / last_seen_at).
-- On remplace le grant UPDATE table-wide par un grant au niveau colonne.
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

-- Une expédition active par joueur.
create table public.expeditions (
  player_id       uuid primary key references public.profiles (id) on delete cascade,
  dungeon_id      text not null references public.dungeons (id),
  hero_ids        uuid[] not null,
  started_at      timestamptz not null default now(),
  last_claimed_at timestamptz not null default now()
);

alter table public.expeditions enable row level security;

-- Lecture seule côté client (pour l'affichage / le ticker). Toutes les écritures
-- passent par l'Edge Function en service_role.
create policy "expeditions select own"
  on public.expeditions for select to authenticated
  using ((select auth.uid()) = player_id);

-- Vue leaderboard : on ajoute la colonne "gold" (or total accumulé).
create or replace view public.leaderboard
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
  coalesce(pr.max_difficulty, 0)     as max_difficulty,
  p.gold                             as gold
from public.profiles p
left join player_power pp on pp.owner_id = p.id
left join player_runs  pr on pr.player_id = p.id;

grant select on public.leaderboard to anon, authenticated;
