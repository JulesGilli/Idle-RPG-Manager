-- L'immobilisation des héros redevient la règle, et devient une propriété DU RUN.
--
-- Le palier d'arbre « Intendance autonome » (niveau 6) libère les héros. Comme
-- il s'achète en cours de partie, le verrouillage ne peut pas être une propriété
-- du joueur : un run lancé AVANT le déblocage doit continuer d'immobiliser son
-- escouade jusqu'à sa réclamation, sinon débloquer la compétence libérerait
-- rétroactivement des héros déjà partis.
--
-- Défaut TRUE = comportement historique : un run existant continue de bloquer.
alter table public.expedition_runs
  add column if not exists locks_heroes boolean not null default true;

comment on column public.expedition_runs.locks_heroes is
  'Ce run immobilise-t-il ses heros ? Fige a la creation selon le palier Intendance autonome du joueur.';
