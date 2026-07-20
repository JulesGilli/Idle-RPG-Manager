-- Une EXPÉDITION n'immobilise plus ses héros.
--
-- L'expédition tourne désormais en arrière-plan : ses héros restent utilisables
-- pour le farm, les donjons, la tour, l'arène. Le verrou d'équipement posé par
-- 0069 (et repris par 0104) n'a donc plus de justification — on ne peut pas dire
-- au joueur « ce héros est libre » et lui refuser de le rééquiper.
--
-- `hero_on_expedition` est CONSERVÉE : elle ne coûte rien, et le jour où une
-- mécanique devra de nouveau savoir qui est parti, la supprimer obligerait à la
-- réécrire à l'identique.

-- equip_item : reprise mot pour mot de 0104, MOINS les deux verrous d'expédition.
create or replace function public.equip_item(p_hero_id uuid, p_item_id uuid, p_slot text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_item_type text; v_item_weight text; v_item_set_id text;
  v_class_id text; v_allowed text[]; v_set_weights text[];
begin
  if v_uid is null then raise exception 'Non authentifié'; end if;
  if not exists (select 1 from public.heroes where id = p_hero_id and owner_id = v_uid) then
    raise exception 'Héros non possédé';
  end if;

  select item_type, weight, set_id into v_item_type, v_item_weight, v_item_set_id
  from public.items where id = p_item_id and owner_id = v_uid;
  if v_item_type is null then raise exception 'Objet non possédé'; end if;
  if v_item_type <> p_slot then raise exception 'Slot incompatible avec le type d''objet'; end if;

  select h.class_id into v_class_id from public.heroes h where h.id = p_hero_id;
  v_allowed := case v_class_id
    when 'paladin'      then array['heavy']
    when 'inquisiteur'  then array['heavy']
    when 'guerrier'     then array['medium']
    when 'necromancien' then array['medium']
    when 'archer'       then array['light']
    when 'voleur'       then array['light']
    when 'mage'         then array['light']
    when 'soigneur'     then array['light']
    else array['light', 'medium', 'heavy']
  end;

  if v_item_set_id is not null then
    -- Poids autorisés par le SET. NULL = set universel (petits sets 2 pièces,
    -- faits d'un bijou et d'une relique : aucun poids, aucune restriction).
    v_set_weights := case v_item_set_id
      when 'colosse'    then array['heavy']
      when 'duelliste'  then array['medium', 'light']
      when 'tacticien'  then array['light']
      else null
    end;
    if v_set_weights is not null and not (v_allowed && v_set_weights) then
      raise exception 'Cet ensemble est réservé à d''autres classes';
    end if;
  elsif p_slot in ('weapon', 'armor') and v_item_weight is not null then
    if not (v_item_weight = any (v_allowed)) then
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

-- unequip_item : reprise de 0069, MOINS le verrou d'expédition.
create or replace function public.unequip_item(p_hero_id uuid, p_slot text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Non authentifié'; end if;
  if not exists (select 1 from public.heroes where id = p_hero_id and owner_id = v_uid) then
    raise exception 'Héros non possédé';
  end if;
  if p_slot = 'weapon' then
    update public.heroes set equipped_weapon_id = null where id = p_hero_id;
  elsif p_slot = 'armor' then
    update public.heroes set equipped_armor_id = null where id = p_hero_id;
  elsif p_slot = 'jewel' then
    update public.heroes set equipped_jewel_id = null where id = p_hero_id;
  elsif p_slot = 'relic' then
    update public.heroes set equipped_relic_id = null where id = p_hero_id;
  else
    raise exception 'Slot invalide';
  end if;
end;
$$;
