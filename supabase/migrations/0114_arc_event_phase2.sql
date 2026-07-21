-- 0114_arc_event_phase2.sql — PHASE 2 du boss d'arc : les cœurs de démon.
--
-- Le pool de PV vidé, l'Être tombe mais ne meurt pas : il dévoile ses cinq
-- cœurs. Il faut les détruire à leur tour pour ouvrir l'arc — sinon il s'échappe
-- à l'échéance, comme une fenêtre de combat expirée.
--
-- Choix d'implémentation : une COLONNE `phase` plutôt qu'un nouveau `status`.
-- Le statut reste 'active' d'un bout à l'autre du combat, ce qui préserve tel
-- quel l'index partiel `arc_events_one_live` (unicité de l'event vivant) et
-- toute la logique d'échéance. Un statut supplémentaire aurait fait sortir la
-- phase 2 de cet index : on aurait pu sonner la cloche d'un SECOND event
-- pendant que les cœurs étaient encore debout.

alter table public.arc_events
  add column if not exists phase int not null default 1 check (phase in (1, 2)),
  add column if not exists phase2_at timestamptz;

comment on column public.arc_events.phase is
  'Phase du combat : 1 = le boss, 2 = les cœurs de démon. hp_max/hp_current sont RÉINITIALISÉS au pool de la phase 2 lors du passage.';
comment on column public.arc_events.phase2_at is
  'Instant où le boss est tombé et où les cœurs ont été révélés (null en phase 1).';
