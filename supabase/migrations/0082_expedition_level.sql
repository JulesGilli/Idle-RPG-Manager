-- Niveau d'expédition (maîtrise globale du joueur).
-- Un unique compteur d'XP par joueur : chaque expédition réclamée en octroie.
-- Le niveau (et ses bonus : durée réduite, loot assuré, +quantités) est dérivé
-- de cette XP côté code partagé (shared/progression/expedition.ts).
alter table public.profiles
  add column if not exists expedition_xp bigint not null default 0;

-- Lecture seule côté client (l'octroi se fait exclusivement dans l'Edge Function
-- resolve-expedition via service_role). Aucun grant d'écriture n'est ajouté.
