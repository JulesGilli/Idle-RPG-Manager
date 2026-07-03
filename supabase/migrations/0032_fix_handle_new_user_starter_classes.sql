-- 0032_fix_handle_new_user_starter_classes.sql
-- CORRECTIF CRITIQUE : les héros de départ étaient créés avec des classes
-- disparues (tank/dps/healer). hero_classes ne contient plus que
-- guerrier/archer/mage/paladin/soigneur, donc l'INSERT échouait sur la FK et
-- faisait ÉCHOUER toute nouvelle inscription (le trigger plante → rollback de
-- la création du compte auth). Trio de départ valide : guerrier / archer / soigneur.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  new_name text;
begin
  new_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(split_part(new.email, '@', 1), ''),
    'Commandant'
  );

  insert into public.profiles (id, display_name)
  values (new.id, new_name);

  insert into public.heroes (owner_id, class_id, name)
  values
    (new.id, 'guerrier', 'Garde'),
    (new.id, 'archer',   'Lame'),
    (new.id, 'soigneur', 'Aube');

  return new;
end;
$function$;
