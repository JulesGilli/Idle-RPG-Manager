-- 0144_bots_gold_calibration.sql
-- Bots : quantité d'or calibrée sur les vrais joueurs (un simple ×10 restait
-- 1000× trop bas). Courbe d'avancement, comme la puissance :
--   or ≈ 80 000 × 200^(levels_cleared/103)  → ~180k à lc16, ~1M à lc50, ~16M à
--   la fin (les finisseurs « normaux » réels sont à ~8-25M ; les whales à des
--   milliards, hors cible). Dérivé de la progression (plus de dépendance à
--   bot_state.gold pour l'affichage), et écrit en bigint (le cap ::int a sauté).

create or replace function public.bot_apply(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s         public.bot_state;
  arc1      int;
  arc2      int;
  n_target  int;
  n_current int;
  t_power   numeric;
  a         int;
begin
  select * into s from public.bot_state where player_id = p_id;
  if not found then return; end if;

  arc1 := least(s.levels_cleared, 53);
  arc2 := greatest(0, s.levels_cleared - 53);

  n_target := least(20, 5 + (s.levels_cleared / 8));
  select count(*) into n_current from public.heroes where owner_id = p_id;
  if n_current < n_target then
    insert into public.heroes (owner_id, class_id, name)
    select p_id, c, initcap(c)
    from (
      select (array['guerrier','mage','archer','soigneur','paladin','voleur','necromancien','inquisiteur'])
               [1 + ((floor(random() * 8)::int + g) % 8)] as c
      from generate_series(1, n_target - n_current) g
    ) q;
  end if;

  t_power := case
    when s.levels_cleared <= 53 then 300 + s.levels_cleared * 30
    else 1890 * power(18.0, (s.levels_cleared - 53) / 50.0)
  end;
  a := greatest(0, round(t_power / 24.0))::int;

  -- Jitter ±20 % PAR HÉROS et par axe, STABLE (hash de l'id, pas random() → ne
  -- flotte pas à chaque tick) : deux héros de même classe n'ont plus la même
  -- puissance, comme de vrais persos aux builds/équipements différents.
  update public.heroes set
    level     = greatest(1, s.hero_level),
    bonus_atk = 0, bonus_def = 0, bonus_hp = 0,
    alloc_atk = greatest(0, round(a * (0.80 + (abs(hashtext(id::text || 'atk')) % 1000) / 2500.0)))::int,
    alloc_def = greatest(0, round(a * (0.80 + (abs(hashtext(id::text || 'def')) % 1000) / 2500.0)))::int,
    alloc_hp  = greatest(0, round(a * (0.80 + (abs(hashtext(id::text || 'hp'))  % 1000) / 2500.0)))::int,
    alloc_speed = 0
  where owner_id = p_id;

  insert into public.level_progress (player_id, level_id, arc)
  select p_id, l.id, 1 from public.levels l order by l.difficulty asc limit arc1
  on conflict do nothing;
  if arc2 > 0 then
    insert into public.level_progress (player_id, level_id, arc)
    select p_id, l.id, 2 from public.levels l order by l.difficulty asc limit arc2
    on conflict do nothing;
  end if;

  insert into public.player_arc (player_id, current_arc, max_arc)
  values (p_id,
          case when s.levels_cleared > 53 then 2 else 1 end,
          case when s.levels_cleared > 53 then 2 else 1 end)
  on conflict (player_id) do update
    set current_arc = excluded.current_arc,
        max_arc     = greatest(public.player_arc.max_arc, excluded.max_arc);

  -- Or calibré sur l'avancement (courbe, comme la puissance).
  update public.profiles set
    gold = round(80000 * power(200.0, s.levels_cleared / 103.0))::bigint,
    account_xp = s.account_xp
  where id = p_id;

  insert into public.pantin_runs (player_id, best_score, days_done)
  values (p_id, greatest(1, round(t_power))::bigint, greatest(1, s.levels_cleared / 3))
  on conflict (player_id) do update
    set best_score = greatest(public.pantin_runs.best_score, excluded.best_score);
end $$;

revoke all on function public.bot_apply(uuid) from public, anon, authenticated;

do $$
declare r record;
begin
  for r in select player_id from public.bot_state loop
    perform public.bot_apply(r.player_id);
  end loop;
end $$;
