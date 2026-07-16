-- Maîtrise de reliquaire (niveau de reliquaire, global par joueur).
-- Troisième et dernier atelier de craft à en recevoir une : la Forge (0083) et
-- la Joaillerie (0084) en ont déjà une, les reliques tiraient encore leur rareté
-- sur les % GLOBAUX figés. Chaque relique forgée octroie de l'XP ; le niveau
-- (dérivé côté code partagé, shared/progression/relic.ts) améliore les
-- probabilités de rareté, donc la puissance de la relique.
alter table public.profiles
  add column if not exists relic_xp bigint not null default 0;

-- Lecture seule côté client : l'octroi se fait exclusivement dans l'Edge Function
-- forge (action craft_relic, service_role). Aucun grant d'écriture n'est ajouté.
