-- 0037_starter_gold_onboarding.sql
-- Onboarding guidé : un nouveau joueur démarre avec 300 or (de quoi recruter son
-- premier compagnon à la Taverne) et un seul Guerrier. Le trigger d'inscription
-- pose l'or de départ directement sur le profil.
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
  values (new.id, new_name, 300);

  insert into public.heroes (owner_id, class_id, name)
  values (new.id, 'guerrier', 'Garde');

  return new;
end;
$function$;
