-- 0062_choose_pseudo_at_signup.sql
-- À la création du compte (magic-link), le pseudo par défaut = préfixe de l'email.
-- On laisse le joueur CHOISIR son pseudo à la 1re connexion via un modal. Ce choix
-- initial ne doit PAS consommer un des 2 changements autorisés (trigger 0061).
--
-- `pseudo_chosen` : false tant que le joueur n'a pas validé son pseudo de départ.
-- RPC `set_initial_pseudo` : pose le pseudo sans incrémenter name_changes, une
-- seule fois (idempotent via la clause pseudo_chosen = false).

alter table public.profiles
  add column if not exists pseudo_chosen boolean not null default false;

-- Les comptes EXISTANTS gardent leur pseudo (pas de modal imposé) : marqués choisis.
update public.profiles set pseudo_chosen = true where pseudo_chosen = false;

create or replace function public.set_initial_pseudo(p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  clean text := btrim(p_name);
begin
  if uid is null then
    raise exception 'Non authentifié';
  end if;
  if length(clean) < 2 or length(clean) > 24 then
    raise exception 'Pseudo invalide : entre 2 et 24 caractères.' using errcode = 'check_violation';
  end if;

  -- 1) Pose le pseudo UNIQUEMENT s'il n'a pas déjà été choisi (anti-rejeu). Ce
  --    premier update déclenche enforce_name_change_limit → name_changes passe à 1.
  update public.profiles set display_name = clean
    where id = uid and pseudo_chosen = false;

  -- 2) Remet le compteur à 0 et marque le pseudo comme choisi. Ce second update ne
  --    change pas display_name → le trigger de limite ne le recompte pas.
  update public.profiles set name_changes = 0, pseudo_chosen = true
    where id = uid and pseudo_chosen = false;
end;
$$;

grant execute on function public.set_initial_pseudo(text) to authenticated;
