-- 0137_bots_double.sql
-- BOTS : passage de 15 à 30 (mieux peupler classements / chat).
--
-- Spawn de 15 nouveaux bots (via spawn_bot : auth.users + profil + héros +
-- bot_state), puis répartition de leur progression sur les DEUX arcs et de leurs
-- cibles (comme les 15 premiers). bot_apply + bot_sync_arena les branchent au
-- classement principal, à l'arène, au Pantin ; le Pantin/leaderboard/online sont
-- automatiques via le flag is_bot. Idempotent : ne fait rien si on a déjà ≥ 30 bots.

do $$
declare
  names text[] := array[
    'Cael', 'Ravena', 'Thorgan', 'Elyndra', 'Vharok', 'Sombrelys', 'Kordrin',
    'Ithael', 'Draven', 'Maelis', 'Orwin', 'Sylphine', 'Gorvath', 'Ninuel', 'Azramel'
  ];
  hls   int[]     := array[90, 84, 78, 71, 65, 58, 51, 45, 38, 32, 26, 20, 15, 12, 9];
  paces numeric[] := array[1.4, 1.1, 0.9, 1.3, 1.0, 1.5, 0.8, 1.2, 1.0, 0.7, 1.3, 0.9, 1.4, 0.8, 1.1];
  new_ids uuid[] := '{}';
  vid uuid;
  i int;
begin
  if (select count(*) from public.bot_state) >= 30 then
    return;
  end if;

  for i in 1 .. array_length(names, 1) loop
    -- spawn_bot plafonne levels à 53 : on ajuste la progression juste après.
    vid := public.spawn_bot(names[i], hls[i], 53, paces[i]);
    new_ids := new_ids || vid;
  end loop;

  -- Progression carte répartie sur les deux arcs (10 → 100) pour les nouveaux.
  with ranked as (
    select player_id, row_number() over (order by hero_level, player_id) as rn,
           count(*) over () as n
    from public.bot_state where player_id = any(new_ids)
  )
  update public.bot_state bs
    set levels_cleared = round(10 + (r.rn - 1) * (100.0 - 10) / greatest(1, r.n - 1))::int
  from ranked r
  where r.player_id = bs.player_id;

  -- Cibles personnelles (niveau jusqu'à 95, avancement jusqu'à 106), au-dessus
  -- de la progression courante — même logique que les 15 premiers.
  with ranked as (
    select player_id, hero_level, levels_cleared,
           row_number() over (order by hero_level, player_id) as rn,
           count(*) over () as n
    from public.bot_state where player_id = any(new_ids)
  )
  update public.bot_state bs
    set target_level = least(95, greatest(bs.hero_level + 2,
          round(24 + (r.rn - 1) * (95.0 - 24) / greatest(1, r.n - 1))::int)),
        target_zone  = least(106, greatest(bs.levels_cleared + 2,
          round(24 + (r.rn - 1) * (106.0 - 24) / greatest(1, r.n - 1))::int))
  from ranked r
  where r.player_id = bs.player_id;

  -- Applique (héros, level_progress arc 1/2, player_arc, gold, pantin) + arène.
  foreach vid in array new_ids loop
    perform public.bot_apply(vid);
    perform public.bot_sync_arena(vid);
  end loop;

  -- Répartit les nouveaux bots dans les deux guildes de bots (sous le plafond 20).
  declare
    g_sen uuid;
    g_cre uuid;
    cnt_sen int;
    cnt_cre int;
    j int;
  begin
    select id into g_sen from public.guilds where name = 'Les Sentinelles d''Airain';
    select id into g_cre from public.guilds where name = 'Ordre du Crépuscule';
    select count(*) into cnt_sen from public.guild_members where guild_id = g_sen;
    select count(*) into cnt_cre from public.guild_members where guild_id = g_cre;
    for j in 1 .. array_length(new_ids, 1) loop
      if (j % 2 = 1 and cnt_sen < 20) or cnt_cre >= 20 then
        if cnt_sen < 20 then
          insert into public.guild_members (player_id, guild_id, role, contribution)
          values (new_ids[j], g_sen, 'member', 200 + (select hero_level from public.bot_state where player_id = new_ids[j]) * 40)
          on conflict (player_id) do nothing;
          cnt_sen := cnt_sen + 1;
        end if;
      elsif cnt_cre < 20 then
        insert into public.guild_members (player_id, guild_id, role, contribution)
        values (new_ids[j], g_cre, 'member', 200 + (select hero_level from public.bot_state where player_id = new_ids[j]) * 40)
        on conflict (player_id) do nothing;
        cnt_cre := cnt_cre + 1;
      end if;
    end loop;
  end;
end $$;
