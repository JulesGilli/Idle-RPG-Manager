-- Maîtrise de joaillerie (niveau de joaillier, global par joueur).
-- Chaque sertissage octroie de l'XP ; le niveau (dérivé côté code partagé,
-- shared/progression/jewelry.ts) améliore les probabilités de rareté, donc la
-- puissance du passif (la rareté multiplie le %).
alter table public.profiles
  add column if not exists jewel_xp bigint not null default 0;

-- Lecture seule côté client : l'octroi se fait exclusivement dans l'Edge Function
-- forge (action craft_jewel, service_role). Aucun grant d'écriture n'est ajouté.
