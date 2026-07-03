-- 0027_account_xp.sql
-- XP de COMPTE (méta-progression) : débloque progressivement les activités du jeu.
-- Le joueur gagne 10% de l'XP totale de ses héros (voir shared/progression/account.ts).
--
-- Écriture SERVEUR uniquement : l'XP de compte est créditée par les Edge Functions
-- (service_role). Le client ne fait que la LIRE via son profil (policy SELECT existante).

alter table public.profiles
  add column if not exists account_xp bigint not null default 0;

-- Grandfathering : les comptes existants (créés avant l'introduction du système)
-- gardent l'accès à toutes les activités. 20000 XP dépasse le palier max (guilde, niv.10).
-- Les nouveaux comptes démarrent à 0 (Carte + Escouade uniquement).
update public.profiles set account_xp = 20000 where account_xp = 0;
