-- 0127_unlock_arc2_latecomers.sql
-- Bug : des joueurs ayant fini la carte d'Arc 1 (boss final = celestial_5) ne
-- voyaient pas l'Arc 2, alors qu'il est ouvert globalement (arc_world). Cause :
-- max_arc n'etait bumpe qu'AU MOMENT ou l'event d'arc a ete vaincu (one-shot) ;
-- les RETARDATAIRES qui finissent apres n'etaient jamais debloques.
--
-- Correctif durable : un TRIGGER sur level_progress debloque l'arc suivant des
-- que le boss final d'Arc 1 est vaincu ET que l'Arc 2 est ouvert. Plus un
-- backfill des joueurs deja coinces.

create or replace function public.unlock_next_arc_on_boss_clear()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_arc1_worldboss boolean;
  v_arc2_open boolean;
begin
  if NEW.arc is distinct from 1 then return NEW; end if;

  select exists (
    select 1 from public.levels l join public.maps m on m.id = l.map_id
    where l.id = NEW.level_id and l.is_boss and coalesce(m.min_arc, 1) = 1
      and m.sort = (select max(sort) from public.maps where coalesce(min_arc, 1) = 1)
  ) into v_is_arc1_worldboss;
  if not v_is_arc1_worldboss then return NEW; end if;

  select coalesce(bool_or(opened), false) into v_arc2_open
    from public.arc_world where arc = 2;
  if not v_arc2_open then return NEW; end if;

  insert into public.player_arc (player_id, current_arc, max_arc)
  values (NEW.player_id, 1, 2)
  on conflict (player_id) do update
    set max_arc = greatest(public.player_arc.max_arc, excluded.max_arc);

  return NEW;
end;
$$;

drop trigger if exists trg_unlock_next_arc on public.level_progress;
create trigger trg_unlock_next_arc
  after insert on public.level_progress
  for each row execute function public.unlock_next_arc_on_boss_clear();

with eligible as (
  select distinct lp.player_id
  from public.level_progress lp
  join public.levels l on l.id = lp.level_id
  join public.maps m on m.id = l.map_id
  where lp.arc = 1 and l.is_boss and coalesce(m.min_arc, 1) = 1
    and m.sort = (select max(sort) from public.maps where coalesce(min_arc, 1) = 1)
    and exists (select 1 from public.arc_world w where w.arc = 2 and w.opened)
)
insert into public.player_arc (player_id, current_arc, max_arc)
select e.player_id, 1, 2 from eligible e
on conflict (player_id) do update
  set max_arc = greatest(public.player_arc.max_arc, 2);

-- Fonction de trigger : jamais appelee en RPC (seul le trigger l'invoque, en
-- definer). On retire l'execute par defaut a public/anon/authenticated.
revoke all on function public.unlock_next_arc_on_boss_clear() from public, anon, authenticated;
