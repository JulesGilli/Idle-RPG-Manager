-- 0145_bots_level_count_fix.sql
-- Bug « les bots dépassent le nombre de niveaux max du jeu ».
--
-- Le jeu a 53 niveaux au total, mais répartis par arc côté joueur RÉEL :
--   • Arc 1 = 50 niveaux (les 10 zones de 5, SANS la zone finale).
--   • Arc 2 = 53 niveaux (les 10 zones + la zone `finale` de 3 niveaux, rangs
--     de difficulté 51-52-53, réservée à l'arc 2 — cf. objectif « zone 11 »).
--   → un finisseur réel affiche 103 niveaux (50 + 53), jamais plus.
--
-- Or `bot_apply` coupait l'arc 1 à 53 (il incluait la finale dans l'arc 1) et
-- laissait levels_cleared monter jusqu'à ~106, si bien qu'un bot pouvait
-- afficher 53 niv. en arc 1 (au lieu de 50 max) et jusqu'à 104 au total — au-
-- dessus du plafond réel de 103. On réaligne le découpage sur les vrais joueurs.

-- 1) Découpage arc correct : arc 1 plafonné à 50, arc 2 à 53. La zone finale
--    (difficulté 51-53) tombe donc uniquement dans l'arc 2, comme pour un joueur.
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

  -- Arc 1 = 50 niveaux max (hors finale) ; le reste bascule en arc 2 (≤ 53).
  arc1 := least(s.levels_cleared, 50);
  arc2 := least(greatest(0, s.levels_cleared - 50), 53);

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

  -- Puissance/héros : modeste en arc 1, explose en arc 2, ~34k à la fin (lc 103).
  t_power := case
    when s.levels_cleared <= 50 then 300 + s.levels_cleared * 30
    else 1890 * power(18.0, (s.levels_cleared - 50) / 53.0)
  end;
  a := greatest(0, round(t_power / 24.0))::int;

  -- Jitter ±20 % PAR HÉROS et par axe, STABLE (hash de l'id).
  update public.heroes set
    level     = greatest(1, s.hero_level),
    bonus_atk = 0, bonus_def = 0, bonus_hp = 0,
    alloc_atk = greatest(0, round(a * (0.80 + (abs(hashtext(id::text || 'atk')) % 1000) / 2500.0)))::int,
    alloc_def = greatest(0, round(a * (0.80 + (abs(hashtext(id::text || 'def')) % 1000) / 2500.0)))::int,
    alloc_hp  = greatest(0, round(a * (0.80 + (abs(hashtext(id::text || 'hp'))  % 1000) / 2500.0)))::int,
    alloc_speed = 0
  where owner_id = p_id;

  -- Arc 1 : les 50 premiers par difficulté (exclut la finale, rangs 51-53).
  insert into public.level_progress (player_id, level_id, arc)
  select p_id, l.id, 1 from public.levels l order by l.difficulty asc limit arc1
  on conflict do nothing;
  -- Arc 2 : tout, finale comprise.
  if arc2 > 0 then
    insert into public.level_progress (player_id, level_id, arc)
    select p_id, l.id, 2 from public.levels l order by l.difficulty asc limit arc2
    on conflict do nothing;
  end if;

  insert into public.player_arc (player_id, current_arc, max_arc)
  values (p_id,
          case when s.levels_cleared > 50 then 2 else 1 end,
          case when s.levels_cleared > 50 then 2 else 1 end)
  on conflict (player_id) do update
    set current_arc = excluded.current_arc,
        max_arc     = greatest(public.player_arc.max_arc, excluded.max_arc);

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

-- 2) Plafonne l'état des bots au maximum réel (50 arc 1 + 53 arc 2 = 103).
update public.bot_state set
  levels_cleared = least(levels_cleared, 103),
  target_zone    = least(target_zone, 103);

-- 3) Purge les lignes arc-1 « finale » semées à tort chez les bots (l'arc 1 ne
--    doit jamais contenir la zone finale). bot_apply ne supprime pas, on le fait
--    explicitement ; il ne les ré-insérera plus (limit 50 les exclut).
delete from public.level_progress lp
using public.levels l
where lp.level_id = l.id
  and l.map_id = 'finale'
  and lp.arc = 1
  and lp.player_id in (select player_id from public.bot_state);

-- 4) Ré-applique tout (découpage + puissance + or) + rafraîchit l'arène.
do $$
declare r record;
begin
  for r in select player_id from public.bot_state loop
    perform public.bot_apply(r.player_id);
    perform public.bot_sync_arena(r.player_id);
  end loop;
end $$;
