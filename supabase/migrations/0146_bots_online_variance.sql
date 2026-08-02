-- 0146_bots_online_variance.sql
-- « En ligne » des bots trop régulier : l'ancien compteur valait 4 + (bucket%2),
-- donc toujours 4 ou 5, alternant proprement — ça sentait le script. On veut une
-- fourchette 1..7 qui saute de façon irrégulière (parfois un seul connecté,
-- parfois 7).
--
-- Le NOMBRE en ligne dérive maintenant d'un hash du créneau de 15 min
-- (`hashtext('online_' || bucket)`), bien réparti d'un créneau à l'autre → pas
-- de motif visible. QUI est en ligne continue de tourner via md5(id || bucket).

create or replace view public.bots_online
with (security_invoker = false) as
select id, name
from (
  select
    p.id,
    p.display_name as name,
    row_number() over (
      order by md5(p.id::text || floor(extract(epoch from now()) / 900)::text)
    ) as rn
  from public.profiles p
  where p.is_bot
) s
where rn <= 1 + (abs(hashtext('online_' || floor(extract(epoch from now()) / 900)::text)) % 7);
