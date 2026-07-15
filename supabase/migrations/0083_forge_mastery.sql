-- Maîtrise de forge (niveau de forgeron, global par joueur).
-- Chaque craft d'arme/armure octroie de l'XP de forge ; le niveau (dérivé côté
-- code partagé, shared/progression/forge.ts) améliore les probabilités de rareté.
alter table public.profiles
  add column if not exists forge_xp bigint not null default 0;

-- Lecture seule côté client : l'octroi se fait exclusivement dans l'Edge Function
-- forge (service_role). Aucun grant d'écriture n'est ajouté.
