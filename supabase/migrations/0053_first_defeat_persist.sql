-- 0053_first_defeat_persist.sql
-- Le jalon d'onboarding « première défaite » (débloque village + taverne) était
-- stocké en localStorage → perdu en changeant de machine, re-verrouillant le
-- village pour un joueur pourtant avancé. On le persiste désormais en DB.

alter table public.profiles
  add column if not exists has_lost boolean not null default false;

-- Backfill : tout joueur ayant clairement dépassé l'intro (XP de compte gagnée,
-- ou au moins un niveau validé) a forcément déjà passé ce jalon.
update public.profiles p
  set has_lost = true
  where has_lost = false
    and (
      p.account_xp > 0
      or exists (select 1 from public.level_progress lp where lp.player_id = p.id)
    );

-- Marque la première défaite (idempotent). Appelé à la fin d'un combat perdu.
create or replace function public.record_defeat()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Non authentifié'; end if;
  update public.profiles set has_lost = true where id = v_uid and has_lost = false;
end;
$$;

revoke execute on function public.record_defeat() from public, anon;
grant  execute on function public.record_defeat() to authenticated;
