-- 0061_pseudo_change_limit.sql
-- Les joueurs peuvent changer leur pseudo, mais 2 fois maximum (certains ne
-- veulent pas laisser leur nom réel). On compte les changements dans une colonne
-- et on plafonne via un trigger BEFORE UPDATE — robuste quelle que soit l'origine
-- de la mise à jour (le client peut déjà écrire `display_name`, grant en 0005).

alter table public.profiles
  add column if not exists name_changes int not null default 0;

create or replace function public.enforce_name_change_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Ne fait rien si le pseudo ne change pas (autres updates : gold, xp…).
  if new.display_name is distinct from old.display_name then
    if old.name_changes >= 2 then
      raise exception 'Limite de changements de pseudo atteinte (2 max).'
        using errcode = 'check_violation';
    end if;
    if length(btrim(new.display_name)) < 2 or length(btrim(new.display_name)) > 24 then
      raise exception 'Pseudo invalide : entre 2 et 24 caractères.'
        using errcode = 'check_violation';
    end if;
    -- Normalise (trim) et incrémente le compteur. Le trigger peut écrire
    -- name_changes même si le client n'a pas le grant sur cette colonne.
    new.display_name := btrim(new.display_name);
    new.name_changes := old.name_changes + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_name_change_limit on public.profiles;
create trigger trg_enforce_name_change_limit
  before update on public.profiles
  for each row execute function public.enforce_name_change_limit();
