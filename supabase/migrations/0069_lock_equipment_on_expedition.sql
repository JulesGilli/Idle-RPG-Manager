-- 0069_lock_equipment_on_expedition.sql
-- Verrouille l'équipement d'un héros tant qu'il est en EXPÉDITION (status
-- 'in_progress'). Sans ça, on pouvait envoyer une équipe en expédition, puis
-- déplacer le meilleur stuff sur d'autres héros et repartir → même stuff réutilisé
-- sur plusieurs expéditions pour franchir le palier de puissance (1000).
-- On bloque : (a) équiper/déséquiper un héros en expédition, (b) équiper sur un
-- AUTRE héros un objet actuellement porté par un héros en expédition.

-- Helper : le héros est-il dans une expédition en cours ?
create or replace function public.hero_on_expedition(p_hero_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.expedition_runs
    where status = 'in_progress' and p_hero_id = any (hero_ids)
  );
$$;
revoke execute on function public.hero_on_expedition(uuid) from public, anon;

-- equip_item : ajoute le verrou d'expédition (héros cible + objet déjà porté par
-- un héros en expédition), en conservant la contrainte de poids par classe.
create or replace function public.equip_item(p_hero_id uuid, p_item_id uuid, p_slot text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_item_type text; v_item_weight text; v_item_set_id text;
  v_class_id text; v_allowed text[];
begin
  if v_uid is null then raise exception 'Non authentifié'; end if;
  if not exists (select 1 from public.heroes where id = p_hero_id and owner_id = v_uid) then
    raise exception 'Héros non possédé';
  end if;
  -- Verrou d'expédition : le héros cible ne doit pas être en expédition…
  if public.hero_on_expedition(p_hero_id) then
    raise exception 'Héros en expédition — équipement verrouillé';
  end if;
  -- …et l'objet ne doit pas être actuellement porté par un héros en expédition.
  if exists (
    select 1 from public.heroes h
    where h.owner_id = v_uid
      and p_item_id in (h.equipped_weapon_id, h.equipped_armor_id, h.equipped_jewel_id, h.equipped_relic_id)
      and public.hero_on_expedition(h.id)
  ) then
    raise exception 'Objet porté par un héros en expédition — verrouillé';
  end if;
  select item_type, weight, set_id into v_item_type, v_item_weight, v_item_set_id
  from public.items where id = p_item_id and owner_id = v_uid;
  if v_item_type is null then raise exception 'Objet non possédé'; end if;
  if v_item_type <> p_slot then raise exception 'Slot incompatible avec le type d''objet'; end if;
  -- Contrainte de poids : uniquement arme/armure hors set et de poids défini.
  if p_slot in ('weapon', 'armor') and v_item_set_id is null and v_item_weight is not null then
    select h.class_id into v_class_id from public.heroes h where h.id = p_hero_id;
    v_allowed := case v_class_id
      when 'paladin'  then array['heavy']
      when 'guerrier' then array['heavy', 'medium']
      when 'archer'   then array['medium', 'light']
      when 'mage'     then array['light']
      when 'soigneur' then array['light']
      else array['light', 'medium', 'heavy']
    end;
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

-- unequip_item : interdit de retirer l'équipement d'un héros en expédition.
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
  if public.hero_on_expedition(p_hero_id) then
    raise exception 'Héros en expédition — équipement verrouillé';
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
