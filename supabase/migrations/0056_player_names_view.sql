-- 0056_player_names_view.sql
-- Les pseudos des AUTRES joueurs s'affichaient « Joueur » (guilde, garnison, DM)
-- car la RLS de `profiles` est « select own » : un join vers profiles renvoie null
-- pour autrui. On expose UNIQUEMENT (id, display_name) via une vue publique
-- (security_invoker=false → bypass la RLS, n'expose aucune autre colonne).

create view public.player_names
with (security_invoker = false)
as select id, display_name from public.profiles;

grant select on public.player_names to authenticated;
