-- Système de SORTIE PROGRAMMÉE (annonce + verrou à l'heure serveur).
--
-- Une clé `release_at` (timestamp) dans app_config = l'heure officielle de bascule
-- d'une mise à jour. Avant : bandeau compte à rebours + features V1.1 verrouillées.
-- À release_at pile (HORLOGE SERVEUR), tout se déverrouille automatiquement — pas
-- de redéploiement, et impossible de débloquer en avance en trichant l'horloge du PC.
--
-- app_config a RLS SANS policy (client aveugle) et contient des SECRETS. On expose
-- donc UNIQUEMENT les 3 clés publiques de release via un RPC SECURITY DEFINER —
-- jamais un accès direct à la table.

insert into public.app_config (key, value) values
  ('release_at',      '2026-07-11T18:00:00+02:00'),
  ('release_version', 'V1.1'),
  ('release_title',   'New Tower, and… new items')
on conflict (key) do update set value = excluded.value;

-- Renvoie l'info publique de sortie + l'heure SERVEUR (pour un compte à rebours et
-- une bascule insensibles à l'horloge du client). N'expose aucune autre clé.
create or replace function public.release_info()
returns table (release_at timestamptz, server_now timestamptz, version text, title text)
language sql
security definer
set search_path = public
as $$
  select
    (select value::timestamptz from public.app_config where key = 'release_at'),
    now(),
    (select value from public.app_config where key = 'release_version'),
    (select value from public.app_config where key = 'release_title');
$$;

-- Lisible par les joueurs connectés uniquement.
revoke all on function public.release_info() from public;
grant execute on function public.release_info() to authenticated;
