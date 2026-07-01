-- Suppression d'items côté serveur (les items sont SELECT-only pour le client).
-- Un item équipé est automatiquement dééquipé (FK ON DELETE SET NULL).

create or replace function public.delete_items(p_item_ids uuid[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_count int;
begin
  if v_uid is null then raise exception 'Non authentifié'; end if;

  delete from public.items where id = any(p_item_ids) and owner_id = v_uid;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.delete_items(uuid[]) from public, anon;
grant execute on function public.delete_items(uuid[]) to authenticated;
