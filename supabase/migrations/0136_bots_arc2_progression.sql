-- 0136_bots_arc2_progression.sql
-- BOTS : progression étendue à l'ARC 2 (jusqu'à la fin).
--
-- Jusqu'ici les bots ne progressaient qu'en arc 1 (level_progress arc=1, pas de
-- player_arc). Désormais `bot_state.levels_cleared` court sur 0→106 : 1-53 = arc 1,
-- 54-106 = arc 2 (les mêmes 53 niveaux, rejoués en arc 2). `bot_apply` crée les
-- level_progress des deux arcs et débloque `player_arc` quand le bot passe en arc 2.
-- Les cibles (`target_zone`) montent jusqu'à 106 pour que les bots vétérans
-- traversent tout l'arc 2, en gardant la diversité (chaque bot a SA cible).

-- bot_apply : progression sur deux arcs + player_arc (le reste inchangé).
create or replace function public.bot_apply(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s    public.bot_state;
  arc1 int;
  arc2 int;
begin
  select * into s from public.bot_state where player_id = p_id;
  if not found then return; end if;

  arc1 := least(s.levels_cleared, 53);            -- niveaux d'arc 1 franchis
  arc2 := greatest(0, s.levels_cleared - 53);     -- niveaux d'arc 2 franchis

  update public.heroes set
    level     = greatest(1, s.hero_level),
    bonus_atk = s.hero_level * 4,
    bonus_def = s.hero_level * 4,
    bonus_hp  = s.hero_level * 10,
    alloc_atk = s.hero_level,
    alloc_def = s.hero_level,
    alloc_hp  = s.hero_level * 2
  where owner_id = p_id;

  -- Arc 1 : les `arc1` niveaux les plus faciles.
  insert into public.level_progress (player_id, level_id, arc)
  select p_id, l.id, 1
  from public.levels l
  order by l.difficulty asc
  limit arc1
  on conflict do nothing;

  -- Arc 2 : les `arc2` niveaux les plus faciles, rejoués en arc 2.
  if arc2 > 0 then
    insert into public.level_progress (player_id, level_id, arc)
    select p_id, l.id, 2
    from public.levels l
    order by l.difficulty asc
    limit arc2
    on conflict do nothing;
  end if;

  -- Arc courant : passe en arc 2 dès qu'on dépasse l'arc 1.
  insert into public.player_arc (player_id, current_arc, max_arc)
  values (p_id,
          case when s.levels_cleared > 53 then 2 else 1 end,
          case when s.levels_cleared > 53 then 2 else 1 end)
  on conflict (player_id) do update
    set current_arc = excluded.current_arc,
        max_arc     = greatest(public.player_arc.max_arc, excluded.max_arc);

  update public.profiles
    set gold = least(s.gold, 2000000000)::int,
        account_xp = s.account_xp
  where id = p_id;

  insert into public.pantin_runs (player_id, best_score, days_done)
  values (
    p_id,
    s.hero_level::bigint * 8000 + (abs(hashtext(p_id::text)) % 40000),
    greatest(1, s.levels_cleared / 3)
  )
  on conflict (player_id) do update
    set best_score = greatest(public.pantin_runs.best_score, excluded.best_score);
end $$;

revoke all on function public.bot_apply(uuid) from public, anon, authenticated;

-- Répartit la progression actuelle sur les DEUX arcs (8→100) : les vétérans
-- passent en arc 2 tout de suite, et l'échelle reste peuplée partout.
with ranked as (
  select player_id, row_number() over (order by levels_cleared, player_id) as rn,
         count(*) over () as n
  from public.bot_state
)
update public.bot_state bs
  set levels_cleared = round(8 + (r.rn - 1) * (100.0 - 8) / greatest(1, r.n - 1))::int
from ranked r
where r.player_id = bs.player_id;

-- Cibles d'avancement carte : réparties jusqu'à 106 (fin de l'arc 2), toujours
-- au-dessus de la progression courante.
with ranked as (
  select player_id, levels_cleared,
         row_number() over (order by levels_cleared, player_id) as rn,
         count(*) over () as n
  from public.bot_state
)
update public.bot_state bs
  set target_zone = least(106, greatest(bs.levels_cleared + 2,
        round(20 + (r.rn - 1) * (106.0 - 20) / greatest(1, r.n - 1))::int))
from ranked r
where r.player_id = bs.player_id;

-- Applique immédiatement (crée les level_progress arc 1/2 + player_arc).
do $$
declare r record;
begin
  for r in select player_id from public.bot_state loop
    perform public.bot_apply(r.player_id);
  end loop;
end $$;
