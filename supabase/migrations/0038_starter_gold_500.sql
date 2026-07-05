-- 0038_starter_gold_500.sql
-- Onboarding : le joueur démarre avec 500 or, de quoi recruter à la Taverne
-- l'archer ET le soigneur imposés (250 or chacun) pour reformer un trio.
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

  insert into public.profiles (id, display_name, gold)
  values (new.id, new_name, 500);

  insert into public.heroes (owner_id, class_id, name)
  values (new.id, 'guerrier', 'Garde');

  return new;
end;
$function$;
