-- =============================================================================
-- 0122_newbie_event_per_arc.sql
-- Event nouveau joueur — passage MONO-arc → PAR-arc.
--
-- Additif à 0120/0121. L'event existe désormais pour CHAQUE arc « de début » :
-- un joueur d'Arc 1 obtient l'event Arc 1, puis, une fois entré dans l'Arc 2
-- (Terres du Désespoir), l'event Arc 2 — mêmes objectifs, récompenses à
-- l'échelle de l'arc (équipement T2 + plates ×`mapRewardMult`). La clé primaire
-- passe donc de (player_id) à (player_id, arc) : une ligne d'event par arc.
--
-- Toujours écrit via service_role (edge function) ; RLS lecture : propriétaire.
-- =============================================================================

alter table public.newbie_event
  add column if not exists arc int not null default 1 check (arc >= 1);

-- Recompose la clé primaire pour autoriser un event par arc et par joueur.
alter table public.newbie_event drop constraint if exists newbie_event_pkey;
alter table public.newbie_event add constraint newbie_event_pkey primary key (player_id, arc);
