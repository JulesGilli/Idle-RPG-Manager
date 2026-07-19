-- 0100_pantin_leaderboard.sql
-- Classement all-time du Pantin d'entraînement.
--
-- `pantin_runs` est sous RLS « select own » : un joueur ne peut lire que sa
-- propre ligne, donc aucun classement n'est possible depuis le client. Même
-- contournement que la vue `leaderboard` existante : une vue SANS
-- `security_invoker` s'exécute avec les droits de son propriétaire et voit donc
-- toutes les lignes, tout en n'exposant que les colonnes choisies.
--
-- `best_score` est déjà le MEILLEUR score historique du joueur (mis à jour par
-- `daily-dummy`), il n'y a donc rien à agréger : le all-time est un simple tri.
-- Index : le classement trie sur `best_score` à chaque ouverture de l'écran.
create index if not exists pantin_runs_best_score_idx
  on public.pantin_runs (best_score desc);

-- `security_invoker = false` est EXPLICITE, comme `leaderboard`, `arena_ladder`
-- et `player_names` : c'est ce qui fait tourner la vue avec les droits de son
-- propriétaire et donc voir toutes les lignes malgré la RLS.
create or replace view public.pantin_leaderboard with (security_invoker = false) as
select
  r.player_id,
  p.display_name,
  p.title,
  r.best_score,
  r.updated_at,
  -- Rang calculé DANS la vue : le client peut ainsi demander « ma ligne » sans
  -- rapatrier tout le classement pour compter les joueurs devant lui.
  rank() over (order by r.best_score desc) as rank
from public.pantin_runs r
join public.profiles p on p.id = r.player_id
where r.best_score > 0;

comment on view public.pantin_leaderboard is
  'Classement all-time du Pantin. Vue en SECURITY DEFINER implicite pour contourner la RLS « select own » de pantin_runs, comme la vue leaderboard.';

-- Lecture seule, et réservée aux comptes connectés (pas d'`anon`).
revoke all on public.pantin_leaderboard from anon;
grant select on public.pantin_leaderboard to authenticated;
