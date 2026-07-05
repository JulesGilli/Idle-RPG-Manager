-- 0036_single_starter_hero.sql
-- Départ simplifié : un nouveau joueur ne commence plus qu'avec UN héros (un
-- Guerrier). Les autres héros se recrutent ensuite à la Taverne. Remplace le
-- trio de départ du trigger handle_new_user.
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
  values (new.id, 'guerrier', 'Garde');

  return new;
end;
$function$;
