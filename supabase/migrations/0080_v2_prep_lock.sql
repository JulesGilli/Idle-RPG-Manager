-- =============================================================================
-- 0080_v2_prep_lock.sql
-- Verrou plein-écran « Préparation de la V2 » : quand `full_lock` = 'true' ET que
-- `release_at` est dans le futur, les JOUEURS (non-admins) voient un écran de
-- compte à rebours au lieu du jeu. Les ADMINS bypassent (test en prod). L'écran
-- de connexion/inscription reste accessible (le verrou est APRÈS l'auth).
--
-- Découplé du gating de contenu : sans `full_lock='true'`, une sortie programmée
-- n'affiche que le bandeau (comportement actuel). Piloté par app_config, donc
-- date/lock modifiables sans redéploiement.
-- =============================================================================

insert into public.app_config (key, value) values
  ('full_lock', 'false')
on conflict (key) do update set value = excluded.value;

-- Recrée release_info en exposant AUSSI le flag `locked` (public, comme les autres).
create or replace function public.release_info()
returns table (release_at timestamptz, server_now timestamptz, version text, title text, locked boolean)
language sql
security definer
set search_path = public
as $$
  select
    (select value::timestamptz from public.app_config where key = 'release_at'),
    now(),
    (select value from public.app_config where key = 'release_version'),
    (select value from public.app_config where key = 'release_title'),
    coalesce((select value from public.app_config where key = 'full_lock'), 'false') = 'true';
$$;

revoke all on function public.release_info() from public;
grant execute on function public.release_info() to authenticated;
