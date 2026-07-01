-- =============================================================================
-- Archétypes (poids d'équipement), verrouillage d'objets, zones exclusives
-- (ressources + thèmes de loot), et boss de fin de zone.
-- =============================================================================

-- Poids d'équipement par classe (mapping des 3 héros actuels).
alter table public.hero_classes
  add column weight text not null default 'medium' check (weight in ('light', 'medium', 'heavy'));
update public.hero_classes set weight = 'heavy'  where id = 'tank';
update public.hero_classes set weight = 'medium' where id = 'dps';
update public.hero_classes set weight = 'light'  where id = 'healer';

-- Poids d'objet (null = relique, universelle) + verrouillage.
alter table public.items
  add column weight text check (weight in ('light', 'medium', 'heavy')),
  add column locked boolean not null default false;
-- Backfill : les objets existants non-reliques deviennent "moyen" par défaut.
update public.items set weight = 'medium' where item_type <> 'relic' and weight is null;

-- Zones : thème de loot + ressource exclusive + composant de boss.
alter table public.maps
  add column theme         text not null default 'forest',
  add column resource      text not null default 'iron',
  add column boss_resource text not null default 'core';
update public.maps set theme = 'forest', resource = 'ecorce', boss_resource = 'coeur_sylve'
  where id = 'forest';
update public.maps set theme = 'ice', resource = 'cristal', boss_resource = 'givre_pur'
  where id = 'caverns';

-- Boss = dernier niveau de chaque zone (beaucoup plus dur).
alter table public.levels add column is_boss boolean not null default false;
update public.levels set is_boss = true where level_index = 5;
update public.levels
  set enemy_config = '{"enemies":[{"name":"Gardien sylvestre","hp":900,"atk":34,"def":18,"speed":9}]}'
  where id = 'forest_5';
update public.levels
  set enemy_config = '{"enemies":[{"name":"Dragon de givre","hp":1700,"atk":54,"def":25,"speed":13}]}'
  where id = 'caverns_5';

-- --- RPC : équiper avec contrôle de poids -----------------------------------
create or replace function public.equip_item(p_hero_id uuid, p_item_id uuid, p_slot text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_item_type text;
  v_item_weight text;
  v_class_weight text;
begin
  if v_uid is null then raise exception 'Non authentifié'; end if;

  if not exists (select 1 from public.heroes where id = p_hero_id and owner_id = v_uid) then
    raise exception 'Héros non possédé';
  end if;

  select item_type, weight into v_item_type, v_item_weight
  from public.items where id = p_item_id and owner_id = v_uid;
  if v_item_type is null then raise exception 'Objet non possédé'; end if;
  if v_item_type <> p_slot then raise exception 'Slot incompatible avec le type d''objet'; end if;

  -- Les reliques sont universelles ; le reste exige le bon poids.
  if p_slot in ('weapon', 'armor', 'jewel') then
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
end;
$$;

-- --- RPC : verrouiller / déverrouiller ---------------------------------------
create or replace function public.set_item_lock(p_item_ids uuid[], p_locked boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Non authentifié'; end if;
  update public.items set locked = p_locked
  where id = any(p_item_ids) and owner_id = v_uid;
end;
$$;

-- --- RPC : suppression (ignore verrouillés + équipés) ------------------------
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

  delete from public.items i
  where i.id = any(p_item_ids)
    and i.owner_id = v_uid
    and i.locked = false
    and not exists (
      select 1 from public.heroes h
      where h.owner_id = v_uid
        and i.id in (
          h.equipped_weapon_id, h.equipped_armor_id, h.equipped_jewel_id, h.equipped_relic_id
        )
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.set_item_lock(uuid[], boolean) from public, anon;
grant execute on function public.set_item_lock(uuid[], boolean) to authenticated;
