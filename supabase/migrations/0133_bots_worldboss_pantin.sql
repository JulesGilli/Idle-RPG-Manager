-- 0133_bots_worldboss_pantin.sql
-- BOTS Phase 4 : bots dans le classement du PANTIN et du WORLD BOSS.
--
--  • Pantin : la vue `pantin_leaderboard` liste `pantin_runs` (best_score > 0).
--    On dérive le best_score du niveau du bot (monotone, borné par le niveau max) —
--    visible immédiatement. Câblé dans `bot_apply` (donc mis à jour à chaque tick).
--  • World Boss : le classement est calculé en live sur l'ÉVÉNEMENT ACTIF (event
--    de week-end, créé paresseusement par les vrais joueurs). `advance_bots`
--    insère UN hit/jour par bot QUAND un event est actif — self-activant, sans
--    rien casser quand il n'y en a pas.

-- bot_apply : + upsert du best_score de Pantin (le reste inchangé).
create or replace function public.bot_apply(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare s public.bot_state;
begin
  select * into s from public.bot_state where player_id = p_id;
  if not found then return; end if;

  update public.heroes set
    level     = greatest(1, s.hero_level),
    bonus_atk = s.hero_level * 4,
    bonus_def = s.hero_level * 4,
    bonus_hp  = s.hero_level * 10,
    alloc_atk = s.hero_level,
    alloc_def = s.hero_level,
    alloc_hp  = s.hero_level * 2
  where owner_id = p_id;

  insert into public.level_progress (player_id, level_id)
  select p_id, l.id
  from public.levels l
  order by l.difficulty asc
  limit s.levels_cleared
  on conflict do nothing;

  update public.profiles
    set gold = least(s.gold, 2000000000)::int,
        account_xp = s.account_xp
  where id = p_id;

  -- Pantin : score-record dérivé du niveau (+ jitter stable par bot). Monotone
  -- (greatest) : un « meilleur score » ne baisse jamais.
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

-- advance_bots : + hits de World Boss quand un event est actif (1/jour/bot).
create or replace function public.advance_bots()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b       record;
  v_event uuid;
  v_day   text;
begin
  for b in select player_id, pace from public.bot_state loop
    update public.bot_state set
      hero_level     = least(95, hero_level + floor(random() * 2.5 * b.pace)::int),
      levels_cleared = least(53, levels_cleared + floor(random() * 1.6 * b.pace)::int),
      gold           = gold + floor(random() * 5000 * b.pace)::bigint,
      account_xp     = account_xp + floor(random() * 3000 * b.pace)::bigint,
      updated_at     = now()
    where player_id = b.player_id;
    perform public.bot_apply(b.player_id);
    perform public.bot_sync_arena(b.player_id);
  end loop;

  -- Guildes de bots : contributions des membres + xp de guilde.
  update public.guild_members gm
    set contribution = contribution + floor(random() * 250)::int
    where exists (select 1 from public.bot_state bs where bs.player_id = gm.player_id);

  update public.guilds g
    set xp = xp + floor(random() * 1800)::int
    where exists (
      select 1 from public.guild_members gm
      join public.bot_state bs on bs.player_id = gm.player_id
      where gm.guild_id = g.id
    );

  -- World Boss : si un event est ACTIF, chaque bot le frappe une fois pour le
  -- jour courant (PK (event, joueur, jour) → au plus 1/jour, comme les joueurs).
  select id into v_event from public.world_boss_events where status = 'active' limit 1;
  if v_event is not null then
    v_day := to_char(now() at time zone 'Europe/Paris', 'YYYY-MM-DD');
    insert into public.world_boss_hits (event_id, player_id, hit_day, damage)
    select v_event, bs.player_id, v_day,
           (bs.hero_level::bigint * 30000 + floor(random() * 120000))::bigint
    from public.bot_state bs
    on conflict (event_id, player_id, hit_day) do nothing;
  end if;
end $$;

revoke all on function public.advance_bots() from public, anon, authenticated;

-- Semis : crée le pantin_runs de chaque bot existant (via bot_apply, idempotent).
do $$
declare r record;
begin
  for r in select player_id from public.bot_state loop
    perform public.bot_apply(r.player_id);
  end loop;
end $$;
