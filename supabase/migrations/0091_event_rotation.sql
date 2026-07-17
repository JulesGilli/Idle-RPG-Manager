-- Rotation d'événements (week-end double XP/butin + boss de semaine).
--
-- Même philosophie que `release_at`/`admin_ids` : la config vit dans `app_config`
-- (RLS sans policy, aveugle côté client), et le CLIENT n'y accède que via un RPC
-- SECURITY DEFINER qui expose l'horloge serveur + les seules valeurs publiques.
-- Aucune table d'état, aucun cron : l'activité (week-end vs semaine) est calculée
-- à partir de l'horloge serveur par le helper pur `shared/progression/events.ts`.
--
-- Pour régler l'événement sans redéploiement : éditer ces lignes dans le Table
-- Editor Supabase. `event_enabled=false` coupe toute la rotation.

insert into public.app_config (key, value) values
  ('event_enabled', 'true'),
  ('event_weekend_xp_mult', '2'),
  ('event_weekend_gold_mult', '2'),
  ('event_weekend_drop_mult', '2')
on conflict (key) do nothing;

-- Expose au client l'horloge serveur + la config publique de l'événement.
-- Le client cale son horloge sur `server_now` puis calcule l'événement actif
-- localement (même helper que le serveur) — impossible de tricher l'horloge.
create or replace function public.event_info()
returns table (
  server_now timestamptz,
  enabled boolean,
  weekend_xp_mult numeric,
  weekend_gold_mult numeric,
  weekend_drop_mult numeric
)
language sql
security definer
set search_path = public
as $$
  select
    now(),
    coalesce((select value from public.app_config where key = 'event_enabled'), 'true') <> 'false',
    coalesce((select value from public.app_config where key = 'event_weekend_xp_mult'), '2')::numeric,
    coalesce((select value from public.app_config where key = 'event_weekend_gold_mult'), '2')::numeric,
    coalesce((select value from public.app_config where key = 'event_weekend_drop_mult'), '2')::numeric;
$$;

revoke all on function public.event_info() from public;
grant execute on function public.event_info() to authenticated;
