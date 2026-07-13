-- =============================================================================
-- 0078_equip_weight_v2.sql
-- V2 — Recrée equip_item avec les règles de poids « 1 poids par classe » (miroir
-- SQL de CLASS_ALLOWED_WEIGHTS dans shared/progression/loot.ts, cf. docs §11) et
-- ajoute les 3 nouvelles classes. Conserve le verrou d'équipement en expédition
-- (migration 0069) et l'exemption des pièces de set (poids universel).
--
-- ⚠️ VAGUE 2 / JOUR J : change le comportement d'équipement en live (guerrier ne
-- peut plus porter du lourd, archer plus du moyen…). À appliquer dans la fenêtre
-- de bascule, autour du reset. Dépend de 0074 (nouvelles classes présentes).
-- =============================================================================

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
  -- V2 : un seul poids autorisé par classe (miroir de CLASS_ALLOWED_WEIGHTS).
  if p_slot in ('weapon', 'armor') and v_item_set_id is null and v_item_weight is not null then
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
