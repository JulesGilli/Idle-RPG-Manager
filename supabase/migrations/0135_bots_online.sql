-- 0135_bots_online.sql
-- BOTS « en ligne » artificiel.
--
-- Le statut « en ligne » réel passe par Supabase Realtime Presence (canal côté
-- client) : les bots n'ayant pas de client, ils n'y apparaissent jamais. Cette
-- vue expose un SOUS-ENSEMBLE TOURNANT de bots « en ligne maintenant », que le
-- client fusionne dans la liste des présents.
--
-- Choix : ~45 % des bots en ligne à un instant donné, tirés par un hash
-- (id + créneau de 15 min) → un sous-ensemble DIFFÉRENT toutes les 15 minutes,
-- déterministe et SANS aucune écriture (pas de charge, pas de cron dédié).

create or replace view public.bots_online
with (security_invoker = false)
as
select p.id, p.display_name as name
from public.profiles p
where p.is_bot
  and (
    ('x' || substr(md5(p.id::text || floor(extract(epoch from now()) / 900)::text), 1, 7))::bit(28)::int % 100
  ) < 45;

grant select on public.bots_online to anon, authenticated;
