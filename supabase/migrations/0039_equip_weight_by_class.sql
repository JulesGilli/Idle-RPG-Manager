-- 0039_equip_weight_by_class.sql
-- Poids d'équipement : chaque classe accepte désormais un ENSEMBLE de poids
-- (et non plus un seul, via hero_classes.weight qui valaient tous 'medium').
--   paladin  : lourd
--   guerrier : lourd + moyen
--   archer   : moyen + léger
--   mage     : léger
--   soigneur : léger
-- Les bijoux/reliques (poids null) et pièces de set restent universels.
-- Reflète shared/progression/loot.ts::CLASS_ALLOWED_WEIGHTS.
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
  select item_type, weight, set_id into v_item_type, v_item_weight, v_item_set_id
  from public.items where id = p_item_id and owner_id = v_uid;
  if v_item_type is null then raise exception 'Objet non possédé'; end if;
  if v_item_type <> p_slot then raise exception 'Slot incompatible avec le type d''objet'; end if;
  -- Contrainte de poids : uniquement arme/armure hors set et de poids défini.
  -- (bijoux/reliques = poids null = universels ; pièces de set = universelles.)
  if p_slot in ('weapon', 'armor') and v_item_set_id is null and v_item_weight is not null then
    select h.class_id into v_class_id from public.heroes h where h.id = p_hero_id;
    v_allowed := case v_class_id
      when 'paladin'  then array['heavy']
      when 'guerrier' then array['heavy', 'medium']
      when 'archer'   then array['medium', 'light']
      when 'mage'     then array['light']
      when 'soigneur' then array['light']
      else array['light', 'medium', 'heavy'] -- classe inconnue : permissif
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
