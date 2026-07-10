-- 0063_tutorial_onboarding.sql
-- Tutoriel « premiers pas » (spotlight) : montré UNIQUEMENT aux nouveaux comptes.
-- `tuto_done` = true dès que le joueur a fini (ou passé) le tuto ; les nouveaux
-- comptes démarrent à false (default). Les comptes EXISTANTS (qui ont déjà joué)
-- sont marqués « fait » pour ne jamais voir le tuto.

alter table public.profiles
  add column if not exists tuto_done boolean not null default false;

-- Comptes existants au moment de la migration : considérés comme ayant déjà joué.
update public.profiles set tuto_done = true where tuto_done = false;

-- Le client marque le tuto comme terminé/passé (update de sa propre ligne).
grant update (tuto_done) on public.profiles to authenticated;
