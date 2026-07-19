-- 0101_expedition_pity.sql
-- Expéditions : compteur de PITIÉ + rééquilibrage des ressources rares.
--
-- Constat mesuré sur les tables actuelles (le tirage est normalisé, et le nombre
-- de jets vaut la durée en heures) :
--   Forêt Fossile   3 jets, rare à 8/93  → 23,6 % d'avoir ≥1 rare par expédition
--   Ruines          5 jets, rare à 8/88  → 37,9 %
--   Mines           8 jets, rare à 7/85  → 49,7 %
-- Soit, pour cinq expéditions d'affilée SANS la moindre rare : 25,9 % sur la
-- Forêt Fossile. Un joueur sur quatre, sur la PREMIÈRE expédition du jeu, pour
-- 15 heures d'attente. Les données le confirmaient : 9 cœurs de sylve ancien sur
-- tout le serveur contre 364 sèves primordiales.

-- ------------------------------------------------------------------ PITIÉ
-- Un compteur par (joueur, type) : les expéditions se lancent en parallèle et
-- ont des tables différentes, un compteur global mélangerait les malchances.
create table if not exists public.expedition_pity (
  player_id          uuid not null references public.profiles (id) on delete cascade,
  expedition_type_id text not null references public.expedition_types (id) on delete cascade,
  misses             int  not null default 0,
  updated_at         timestamptz not null default now(),
  primary key (player_id, expedition_type_id)
);

alter table public.expedition_pity enable row level security;

-- Lecture seule pour le propriétaire (l'UI peut afficher « prochaine garantie »).
-- Aucune écriture cliente : le compteur est tenu par l'Edge Function.
create policy "expedition_pity readable by owner"
  on public.expedition_pity for select to authenticated
  using (player_id = (select auth.uid()));

comment on table public.expedition_pity is
  'Expeditions consecutives SANS ressource rare, par joueur et par type. Au-dela de EXPEDITION_PITY_LIMIT (2), la suivante garantit la rare. Remis a 0 des qu''une rare tombe.';

-- --------------------------------------------------------------- ÉQUILIBRAGE
-- Poids de la rare remonté pour aligner la Forêt Fossile et les Mines sur les
-- Ruines (~38 % d'avoir ≥1 rare par expédition). La pitié couvre la queue de
-- distribution, ce rééquilibrage relève la moyenne — les deux sont nécessaires :
-- sans lui, la pitié serait déclenchée presque à chaque fois sur la Forêt.
update public.expedition_types
set loot_table = '[{"resource":"seve_primordiale","min":2,"max":5,"weight":60},{"resource":"ambre_vivant","min":1,"max":3,"weight":25},{"resource":"coeur_sylve_ancien","min":1,"max":1,"weight":15}]'::jsonb
where id = 'exp_foret_fossile';

update public.expedition_types
set loot_table = '[{"resource":"minerai_stellaire","min":2,"max":6,"weight":50},{"resource":"gemme_brute","min":1,"max":3,"weight":28},{"resource":"eclat_du_noyau","min":1,"max":1,"weight":9}]'::jsonb
where id = 'exp_mines_abyssales';
