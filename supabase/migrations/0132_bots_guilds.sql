-- 0132_bots_guilds.sql
-- BOTS Phase 3 : deux GUILDES de bots, pour peupler le classement des guildes.
--
-- Les bots étant de vrais profils, une guilde-bot est une simple ligne `guilds`
-- + des `guild_members` bots. La vue `guild_leaderboard` (security_invoker=false)
-- agrège members/contribution/total_power automatiquement : le `total_power`
-- dérive de la puissance des membres (vue `leaderboard`), donc rien à calculer.
-- La progression (xp de guilde + contributions) est poussée par `advance_bots`.

do $$
declare
  ids       uuid[];
  g_a       uuid;
  g_b       uuid;
  founder_a uuid;
  founder_b uuid;
  i         int;
  target    uuid;
  is_founder boolean;
begin
  -- Idempotent : ne rien faire si les guildes-bots existent déjà.
  if exists (select 1 from public.guilds where name in ('Les Sentinelles d''Airain', 'Ordre du Crépuscule')) then
    return;
  end if;

  select array_agg(player_id order by hero_level desc, player_id) into ids from public.bot_state;
  if ids is null or array_length(ids, 1) < 2 then return; end if;

  founder_a := ids[1];  -- indices impairs → guilde A
  founder_b := ids[2];  -- indices pairs   → guilde B

  insert into public.guilds (name, tag, founder_player_id, emblem, description, xp)
    values ('Les Sentinelles d''Airain', 'SEN', founder_a, 'ICON_FantasyWarrior_Map_Flag01',
            'Gardiens de l''aube, toujours en première ligne.', 9000)
    returning id into g_a;

  insert into public.guilds (name, tag, founder_player_id, emblem, description, xp)
    values ('Ordre du Crépuscule', 'CRE', founder_b, 'ICON_FantasyWarrior_Map_Flag01',
            'Marcheurs de l''ombre, patients et méthodiques.', 6500)
    returning id into g_b;

  for i in 1 .. array_length(ids, 1) loop
    target := case when i % 2 = 1 then g_a else g_b end;
    is_founder := (ids[i] = founder_a or ids[i] = founder_b);
    insert into public.guild_members (player_id, guild_id, role, contribution)
      values (
        ids[i],
        target,
        case when is_founder then 'founder' else 'member' end,
        (select 200 + hero_level * 40 from public.bot_state where player_id = ids[i])
      )
      on conflict (player_id) do nothing;  -- au cas où un trigger aurait déjà inscrit le fondateur
  end loop;
end $$;

-- La progression horaire fait aussi avancer les guildes de bots : xp de guilde +
-- contribution de chaque membre bot (le total_power suit tout seul via la vue).
create or replace function public.advance_bots()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare b record;
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

  -- Guildes de bots : contributions des membres + xp de guilde (douces, variées).
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
end $$;

revoke all on function public.advance_bots() from public, anon, authenticated;
