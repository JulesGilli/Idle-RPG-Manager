-- 0131_bots_arena.sql
-- BOTS Phase 2a : les faux joueurs dans l'ARÈNE (affrontables).
--
-- Un bot affrontable = une ligne `arena_entries` avec un `team_snapshot`
-- (CombatantInput[]) : le flux de défi (`arena` edge) lit ce snapshot et résout
-- le combat. `CombatantInput` ne requiert que {id, name, role, hp, atk, def,
-- speed} ; les bots n'ayant ni items ni compétences, un snapshot minimal reconstruit
-- avec les MÊMES formules que `buildHeroSnapshot`/`effectiveStats` suffit et reste
-- fidèle. Tout se fait en SQL (pas d'edge) : les bots rejoignent le ladder au BAS
-- (décision : non intrusif pour les vrais joueurs), et leur défense se rafraîchit
-- avec leur progression via `advance_bots`.

-- Construit / met à jour l'entrée d'arène d'un bot depuis ses héros.
-- Rôle, stats effectives et puissance répliquent le code partagé :
--   effectiveStats : hp = (round((base+innée)×(1+0,05·(niv-1))) + alloc·8) × 4, etc.
--   heroPower      : round(atk·2 + def·2 + hp·0,5 + speed).
create or replace function public.bot_sync_arena(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week     text := to_char(now() at time zone 'Europe/Paris', 'IYYY"-W"IW');
  v_snapshot jsonb;
  v_power    int;
  v_ids      uuid[];
  v_rank     int;
begin
  with hs as (
    -- 3 héros au plus (ARENA_MAX_TEAM). Un bot en a 5 : on prend les 3 premiers.
    select h.id, h.name, h.class_id,
      (1 + 0.05 * (h.level - 1))::numeric as mult,
      h.bonus_hp, h.bonus_atk, h.bonus_def, h.bonus_speed,
      h.alloc_hp, h.alloc_atk, h.alloc_def, h.alloc_speed,
      hc.base_hp, hc.base_atk, hc.base_def, hc.base_speed
    from public.heroes h
    join public.hero_classes hc on hc.id = h.class_id
    where h.owner_id = p_id
    order by h.id
    limit 3
  ),
  stat as (
    select id, name, class_id,
      ((round((base_hp + bonus_hp) * mult) + alloc_hp * 8) * 4)::int as hp,
      (round((base_atk + bonus_atk) * mult) + alloc_atk * 2)::int    as atk,
      (round((base_def + bonus_def) * mult) + alloc_def * 2)::int    as def,
      (base_speed + bonus_speed + alloc_speed)::int                  as speed
    from hs
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id',    id::text,
      'name',  name,
      'role',  case when class_id = 'soigneur' then 'healer'
                    when class_id in ('guerrier', 'paladin') then 'tank'
                    else 'dps' end,
      'hp',    hp,
      'atk',   atk,
      'def',   def,
      'speed', speed
    )), '[]'::jsonb),
    coalesce(sum(round(atk * 2 + def * 2 + hp * 0.5 + speed))::int, 0),
    coalesce(array_agg(id), '{}'::uuid[])
  into v_snapshot, v_power, v_ids
  from stat;

  if exists (select 1 from public.arena_entries where player_id = p_id) then
    update public.arena_entries
      set team_snapshot = v_snapshot,
          team_hero_ids = v_ids,
          power         = v_power,
          active_week   = v_week,
          updated_at    = now()
      where player_id = p_id;
  else
    -- Entrée au BAS du ladder : rang = max actuel + 1 (sous tous les joueurs).
    select coalesce(max(rank), 0) + 1 into v_rank from public.arena_entries;
    insert into public.arena_entries (player_id, rank, team_hero_ids, team_snapshot, power, active_week)
    values (p_id, v_rank, v_ids, v_snapshot, v_power, v_week);
  end if;
end $$;

revoke all on function public.bot_sync_arena(uuid) from public, anon, authenticated;

-- La progression horaire rafraîchit aussi la défense d'arène de chaque bot
-- (crée l'entrée si absente, met à jour le snapshot/puissance sinon).
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
end $$;

revoke all on function public.advance_bots() from public, anon, authenticated;

-- Semis : crée l'entrée d'arène de chaque bot existant (au bas du ladder).
do $$
declare r record;
begin
  for r in select player_id from public.bot_state loop
    perform public.bot_sync_arena(r.player_id);
  end loop;
end $$;
