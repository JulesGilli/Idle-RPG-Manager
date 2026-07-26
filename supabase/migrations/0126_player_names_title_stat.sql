-- 0126_player_names_title_stat.sql
-- Expose, à côté du titre équipé, SON MULTIPLICATEUR DE STAT s'il est encore
-- valide (`title_stat_mult`, null sinon). Sans ça, le chat ne peut pas
-- distinguer un titre honorifique (succès) d'un TITRE DE GLOIRE qui accorde des
-- stats — les deux s'affichaient de la même couleur.
--
-- La valeur est calculée par jointure sur `player_event_titles` : un titre
-- expiré, ou un titre de succès, rend null. La colonne est ajoutée EN FIN de vue
-- → `create or replace` suffit (pas de drop, aucune coupure).
--
-- `security_invoker = false` conservé : c'est précisément ce qui permet de lire
-- le pseudo/titre des AUTRES joueurs sans lever la RLS de `profiles`. La vue
-- n'expose que (id, display_name, title, title_stat_mult) — aucune donnée
-- sensible.

create or replace view public.player_names
with (security_invoker = false)
as
select
  p.id,
  p.display_name,
  p.title,
  (
    select t.stat_mult
    from public.player_event_titles t
    where t.player_id = p.id
      and t.title = p.title
      and t.expires_at > now()
    limit 1
  ) as title_stat_mult
from public.profiles p;

grant select on public.player_names to authenticated;
