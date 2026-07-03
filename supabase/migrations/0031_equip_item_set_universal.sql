-- 0031_equip_item_set_universal.sql
-- Les pièces de set (set_id non null) sont universelles à l'équipement (aucune
-- contrainte de poids). Le reste (weapon/armor/jewel classiques) reste inchangé.
create or replace function public.equip_item(p_hero_id uuid, p_item_id uuid, p_slot text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_item_type text; v_item_weight text; v_class_weight text; v_item_set_id text;
begin
  if v_uid is null then raise exception 'Non authentifié'; end if;
  if not exists (select 1 from public.heroes where id = p_hero_id and owner_id = v_uid) then
    raise exception 'Héros non possédé';
  end if;
  select item_type, weight, set_id into v_item_type, v_item_weight, v_item_set_id
  from public.items where id = p_item_id and owner_id = v_uid;
  if v_item_type is null then raise exception 'Objet non possédé'; end if;
  if v_item_type <> p_slot then raise exception 'Slot incompatible avec le type d''objet'; end if;
  -- Les reliques ET les pièces de set sont universelles ; le reste exige le bon poids.
  if p_slot in ('weapon', 'armor', 'jewel') and v_item_set_id is null then
    select hc.weight into v_class_weight
    from public.heroes h join public.hero_classes hc on hc.id = h.class_id
    where h.id = p_hero_id;
    if v_item_weight is distinct from v_class_weight then
      raise exception 'Poids d''équipement incompatible avec cette classe';
    end if;
  end if;
  if p_slot = 'weapon' then
    update public.heroes set equipped_weapon_id = p_item_id where id = p_hero_id;
  elsif p_slot = 'armor' then
    update public.heroes set equipped_armor_id = p_item_id where id = p_hero_id;
  elsif p_slot = 'jewel' then
    update public.heroes set equipped_jewel_id = p_item_id where id = p_hero_id;
  elsif p_slot = 'relic' then
    update public.heroes set equipped_relic_id = p_item_id where id = p_hero_id;
  else
    raise exception 'Slot invalide';
  end if;
end; $function$;
