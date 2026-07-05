-- Renommage d'un héros. La table heroes est SELECT-only pour le client :
-- l'écriture passe par ce RPC SECURITY DEFINER (vérifie la propriété + valide le nom).

create or replace function public.rename_hero(p_hero_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_name, ''));
begin
  if v_uid is null then raise exception 'Non authentifié'; end if;

  if not exists (select 1 from public.heroes where id = p_hero_id and owner_id = v_uid) then
    raise exception 'Héros non possédé';
  end if;

  if char_length(v_name) < 1 or char_length(v_name) > 24 then
    raise exception 'Nom invalide (1 à 24 caractères)';
  end if;

  update public.heroes set name = v_name where id = p_hero_id;
end;
$$;

revoke execute on function public.rename_hero(uuid, text) from public, anon;
grant  execute on function public.rename_hero(uuid, text) to authenticated;
