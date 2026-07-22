-- HÉROS FAVORIS — une étoile qui les fait remonter en tête de TOUTES les listes.
--
-- Pourquoi une RPC et pas une policy UPDATE : `authenticated` (et `anon`) ont le
-- GRANT UPDATE sur toute la table `heroes` — c'est le défaut Supabase. Seule
-- l'absence de policy UPDATE les bloque aujourd'hui. En ajouter une, même
-- restreinte à `owner_id`, ouvrirait TOUTES les colonnes : niveau, points de
-- stat, compétences, équipement. Un joueur se donnerait 999 niveaux au premier
-- appel REST venu. La RPC ci-dessous n'écrit QUE `favorite`.

alter table public.heroes
  add column if not exists favorite boolean not null default false;

-- Les listes trient « favoris d'abord », puis l'ordre historique.
create index if not exists heroes_owner_favorite_idx
  on public.heroes (owner_id, favorite desc, created_at, id);

/**
 * Marque / démarque un héros comme favori.
 *
 * Le propriétaire est déduit de `auth.uid()`, JAMAIS d'un paramètre : une RPC
 * SECURITY DEFINER qui accepterait un `player_id` laisserait n'importe qui
 * toucher les héros d'autrui (c'est exactement la faille corrigée en 0112).
 * Un id inconnu ou appartenant à un autre joueur ne fait rien et renvoie false.
 */
create or replace function public.set_hero_favorite(p_hero_id uuid, p_value boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_updated int;
begin
  if v_uid is null then
    return false;
  end if;

  update public.heroes
     set favorite = coalesce(p_value, false)
   where id = p_hero_id
     and owner_id = v_uid;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

-- Réservée aux joueurs CONNECTÉS : `anon` n'a aucun héros, donc rien à y faire.
revoke all on function public.set_hero_favorite(uuid, boolean) from public, anon;
grant execute on function public.set_hero_favorite(uuid, boolean) to authenticated;
