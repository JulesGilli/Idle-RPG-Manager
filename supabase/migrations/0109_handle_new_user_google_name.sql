-- Ajoute les clés de métadonnées Google (full_name / name) à la cascade de nom.
-- Un inscrit par e-mail n'a que display_name ; un inscrit Google fournit
-- full_name et name, mais pas display_name. Sans cette ligne, un compte Google
-- s'appellerait par le préfixe de son e-mail au lieu de son vrai nom.
-- Ordre et repli inchangés : aucun impact sur les inscriptions e-mail.
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
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
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
