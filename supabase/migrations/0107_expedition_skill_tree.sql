-- Arbre de compétences d'expédition : allocation du joueur (nœud → rangs).
-- Lecture seule côté client comme `expedition_xp` : seule la fonction edge écrit,
-- après avoir revalidé l'allocation contre le budget du niveau.
alter table public.profiles
  add column if not exists expedition_skills jsonb not null default '{}'::jsonb;

comment on column public.profiles.expedition_skills is
  'Arbre d''expedition : id de noeud -> rangs. Ecrit uniquement par l''edge function resolve-expedition (action set_skills), jamais par le client.';
