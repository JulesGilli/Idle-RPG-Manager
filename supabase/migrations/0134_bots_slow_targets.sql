-- 0134_bots_slow_targets.sql
-- BOTS : progression LENTE et DIVERSITÉ PERMANENTE.
--
-- Avant : chaque bot fonçait vers le plafond dur (niveau 95 / zone 53) en ~4-5
-- jours, puis tous se regroupaient en haut — perte de diversité. Désormais chaque
-- bot a un NIVEAU-CIBLE personnel (réparti sur toute l'échelle) vers lequel il
-- RAMPE lentement (~1 niveau tous les quelques jours). Comme les cibles diffèrent,
-- les bots restent étalés en permanence sur le classement.

alter table public.bot_state add column if not exists target_level int not null default 50;
alter table public.bot_state add column if not exists target_zone  int not null default 30;

-- Répartit les cibles sur toute l'échelle (par rang de niveau actuel), avec un
-- peu de marge au-dessus du niveau courant pour que chacun ait de quoi grimper.
with ranked as (
  select player_id, hero_level, levels_cleared,
    row_number() over (order by hero_level, player_id) as rn,
    count(*) over () as n
  from public.bot_state
)
update public.bot_state bs set
  target_level = least(95, greatest(bs.hero_level + 2,
    round(22 + (r.rn - 1) * (95.0 - 22) / greatest(1, r.n - 1))::int)),
  target_zone  = least(53, greatest(bs.levels_cleared + 1,
    round(6 + (r.rn - 1) * (53.0 - 6) / greatest(1, r.n - 1))::int))
from ranked r
where r.player_id = bs.player_id;

-- advance_bots : rampe LENTE vers la cible (plus de saut vers le plafond dur).
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
      -- +1 niveau seulement de temps en temps (proba ∝ pace) → ~1 niveau / quelques
      -- jours, borné à la cible personnelle. Diversité conservée entre bots.
      hero_level     = least(target_level, hero_level + (case when random() < 0.10 * b.pace then 1 else 0 end)),
      levels_cleared = least(target_zone,  levels_cleared + (case when random() < 0.08 * b.pace then 1 else 0 end)),
      gold           = gold + floor(random() * 800 * b.pace)::bigint,
      account_xp     = account_xp + floor(random() * 500 * b.pace)::bigint,
      updated_at     = now()
    where player_id = b.player_id;
    perform public.bot_apply(b.player_id);
    perform public.bot_sync_arena(b.player_id);
  end loop;

  -- Guildes de bots : contributions + xp (douces).
  update public.guild_members gm
    set contribution = contribution + floor(random() * 120)::int
    where exists (select 1 from public.bot_state bs where bs.player_id = gm.player_id);

  update public.guilds g
    set xp = xp + floor(random() * 600)::int
    where exists (
      select 1 from public.guild_members gm
      join public.bot_state bs on bs.player_id = gm.player_id
      where gm.guild_id = g.id
    );

  -- World Boss : 1 hit/jour/bot si un event est actif.
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
