-- =============================================================================
-- 0121_newbie_event_claims.sql
-- Event nouveau joueur — tranche 3 : état de RÉCLAMATION des récompenses.
--
-- Additif à 0120. Deux listes anti-double-réclamation :
--   • claimed_objectives : ids d'objectifs déjà réclamés (text[]).
--   • claimed_milestones : paliers (%) déjà réclamés (int[]).
-- La réclamation est atomisée côté edge function par un compare-and-swap
-- (array_append seulement si l'id/le % n'y est pas encore).
-- =============================================================================

alter table public.newbie_event
  add column if not exists claimed_objectives text[] not null default '{}',
  add column if not exists claimed_milestones  int[]  not null default '{}';
