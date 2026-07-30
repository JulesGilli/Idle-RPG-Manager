-- 0142_bots_roster_power_calibration.sql
-- Bots : réalisme du ROSTER et de la PUISSANCE, calibrés sur les vrais joueurs.
--
--  • Nombre de héros qui GRANDIT avec l'avancement (5 → 20), comme un vrai joueur
--    (un finisseur à 5 héros trahissait le bot). N = min(20, 5 + levels_cleared/8).
--  • Puissance PAR HÉROS calibrée sur les vrais joueurs : modeste en arc 1
--    (~300 → ~1900), puis explose en arc 2 pour finir à ~34k (les finisseurs réels
--    « normaux » sont à ~28-40k ; les whales à des millions, hors cible).
--  • Puissance portée par les POINTS ALLOUÉS (alloc_*), comptés à la fois par le
--    classement ET la vue publique `hero_public` — contrairement aux bonus innés
--    que `hero_public` ignore (d'où une fiche qui mentait avant). Le DÉTAIL des
--    points alloués n'est pas exposé publiquement, donc rien de suspect.

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

  -- Roster qui grandit avec l'avancement.
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

  -- Cible de puissance par héros (calibrée sur les vrais joueurs).
  t_power := case
    when s.levels_cleared <= 53 then 300 + s.levels_cleared * 30
    else 1890 * power(18.0, (s.levels_cleared - 53) / 50.0)
  end;
  -- Points alloués par axe pour atteindre cette puissance : chaque point vaut
  -- ~24 de puissance réparti (atk×4 + def×4 + hp×16 dans la formule) quand on met
  -- la même valeur sur les 3 axes → alloc = puissance/24.
  a := greatest(0, round(t_power / 24.0))::int;

  update public.heroes set
    level     = greatest(1, s.hero_level),
    bonus_atk = 0, bonus_def = 0, bonus_hp = 0,
    alloc_atk = a, alloc_def = a, alloc_hp = a, alloc_speed = 0
  where owner_id = p_id;

  -- Progression carte (arc 1 puis arc 2) + arc courant.
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

  update public.profiles
    set gold = least(s.gold, 2000000000)::int, account_xp = s.account_xp
  where id = p_id;

  insert into public.pantin_runs (player_id, best_score, days_done)
  values (p_id, greatest(1, round(t_power))::bigint, greatest(1, s.levels_cleared / 3))
  on conflict (player_id) do update
    set best_score = greatest(public.pantin_runs.best_score, excluded.best_score);
end $$;

revoke all on function public.bot_apply(uuid) from public, anon, authenticated;

-- Ré-applique tout (roster + puissance) + rafraîchit l'arène.
do $$
declare r record;
begin
  for r in select player_id from public.bot_state loop
    perform public.bot_apply(r.player_id);
    perform public.bot_sync_arena(r.player_id);
  end loop;
end $$;
