-- Podium des champions de la semaine écoulée (UI d'arène).
--
-- `arena_week_results` est en RLS « chacun ne voit que sa ligne » : indispensable
-- pour les récompenses, mais ça rend le classement de la semaine passée illisible
-- pour tout le monde. Plutôt que d'ouvrir la table en lecture (elle contient les
-- montants réclamés et l'état `claimed_at`), on expose une fonction dédiée qui ne
-- rend QUE ce qu'un podium affiche : rang, nom, victoires/défaites.
--
-- Ces trois informations sont déjà publiques via la vue `arena_ladder` (classement
-- en cours) — on ne divulgue donc rien de nouveau, seulement une photo plus ancienne.

create or replace function public.arena_week_podium(p_limit int default 3)
returns table (week text, rank int, player_id uuid, display_name text, wins int, losses int)
language sql
stable
security definer
set search_path = ''
as $$
  select r.week, r.rank, r.player_id,
         coalesce(p.display_name, 'Joueur') as display_name,
         r.wins, r.losses
  from public.arena_week_results r
  join public.profiles p on p.id = r.player_id
  -- La semaine la plus récemment CLÔTURÉE : les clés sont des semaines ISO
  -- ('2026-W29'), donc l'ordre lexicographique est l'ordre chronologique.
  where r.week = (select max(week) from public.arena_week_results)
  order by r.rank asc
  limit greatest(1, least(coalesce(p_limit, 3), 10));
$$;

revoke execute on function public.arena_week_podium(int) from public, anon;
grant execute on function public.arena_week_podium(int) to authenticated;

comment on function public.arena_week_podium(int) is
  'Top N du classement d''arene de la derniere semaine cloturee (rang, nom, V/D). Contourne le RLS proprietaire de arena_week_results, sans exposer les recompenses.';
