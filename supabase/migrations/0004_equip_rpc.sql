-- =============================================================================
-- RPC d'équipement. Les tables heroes/items sont SELECT-only pour le client :
-- équiper passe donc par ces fonctions SECURITY DEFINER qui valident l'ownership
-- du héros ET de l'objet, et la cohérence slot/type.
-- =============================================================================

create or replace function public.equip_item(p_hero_id uuid, p_item_id uuid, p_slot text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_item_type text;
begin
  if v_uid is null then
    raise exception 'Non authentifié';
  end if;

  if not exists (
    select 1 from public.heroes where id = p_hero_id and owner_id = v_uid
  ) then
    raise exception 'Héros non possédé';
  end if;

  select item_type into v_item_type
  from public.items
  where id = p_item_id and owner_id = v_uid;

  if v_item_type is null then
    raise exception 'Objet non possédé';
  end if;

  if p_slot = 'weapon' and v_item_type = 'weapon' then
    update public.heroes set equipped_weapon_id = p_item_id where id = p_hero_id;
  elsif p_slot = 'armor' and v_item_type = 'armor' then
    update public.heroes set equipped_armor_id = p_item_id where id = p_hero_id;
  else
    raise exception 'Slot incompatible avec le type d''objet';
  end if;
end;
$$;

create or replace function public.unequip_item(p_hero_id uuid, p_slot text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Non authentifié';
  end if;

  if not exists (
    select 1 from public.heroes where id = p_hero_id and owner_id = v_uid
  ) then
    raise exception 'Héros non possédé';
  end if;

  if p_slot = 'weapon' then
    update public.heroes set equipped_weapon_id = null where id = p_hero_id;
  elsif p_slot = 'armor' then
    update public.heroes set equipped_armor_id = null where id = p_hero_id;
  else
    raise exception 'Slot invalide';
  end if;
end;
$$;

-- Seuls les utilisateurs authentifiés peuvent équiper (pas anon).
revoke execute on function public.equip_item(uuid, uuid, text) from public, anon;
revoke execute on function public.unequip_item(uuid, text) from public, anon;
grant execute on function public.equip_item(uuid, uuid, text) to authenticated;
grant execute on function public.unequip_item(uuid, text) to authenticated;
