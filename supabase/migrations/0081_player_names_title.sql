-- 0081_player_names_title.sql
-- Expose le TITRE équipé (profiles.title) via la vue publique player_names, pour
-- l'afficher à côté du pseudo des AUTRES joueurs (chat, guilde) sans lever la RLS
-- de profiles. La colonne est ajoutée en fin de vue → `create or replace` suffit.

create or replace view public.player_names
with (security_invoker = false)
as select id, display_name, title from public.profiles;

grant select on public.player_names to authenticated;
