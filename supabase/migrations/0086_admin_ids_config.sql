-- Statut admin piloté par la DB (fin du hardcode).
--
-- Avant : ADMIN_ID était un UUID unique codé en dur, dupliqué dans le front, le
-- code partagé ET les edge functions. Ajouter un testeur demandait une modif de
-- code + redéploiement.
--
-- Maintenant : la liste des admins vit dans `app_config` (clé `admin_ids`, JSON
-- — tableau d'UUID en texte), au même endroit et avec la même protection que
-- `release_at` (RLS sans policy, table aveugle côté client). Pour ajouter/retirer
-- un testeur : éditer cette ligne depuis le Table Editor Supabase, aucun déploiement.

insert into public.app_config (key, value) values
  ('admin_ids', '["dfc646d3-f9c5-479e-8812-dca9d2265243"]')
on conflict (key) do update set value = excluded.value;

-- Recrée release_info() en exposant AUSSI `is_admin` (pour le compte connecté
-- uniquement, via auth.uid() — jamais la liste complète des admins).
-- DROP d'abord : le type de retour change (ajout de `is_admin`).
drop function if exists public.release_info();
create or replace function public.release_info()
returns table (release_at timestamptz, server_now timestamptz, version text, title text, locked boolean, is_admin boolean)
language sql
security definer
set search_path = public
as $$
  select
    (select value::timestamptz from public.app_config where key = 'release_at'),
    now(),
    (select value from public.app_config where key = 'release_version'),
    (select value from public.app_config where key = 'release_title'),
    coalesce((select value from public.app_config where key = 'full_lock'), 'false') = 'true',
    coalesce((select value from public.app_config where key = 'admin_ids'), '[]')::jsonb ? auth.uid()::text;
$$;

revoke all on function public.release_info() from public;
grant execute on function public.release_info() to authenticated;
