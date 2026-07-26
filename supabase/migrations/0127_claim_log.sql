-- 0127_claim_log.sql
-- JOURNAL DES RÉCOLTES — tracer chaque encaissement de farm de carte.
--
-- Pourquoi : les logs Edge de Supabase ne remontent que ~24 h et ne disent RIEN
-- de ce qui s'est passé DANS la fonction. Quand un joueur signale « j'ai perdu
-- 5000 combats », on ne peut ni confirmer ni infirmer sans trace durable.
--
-- Le journal écrit DEUX lignes par groupe et par claim :
--   • phase 'reserved' — juste après la prise de la fenêtre (l'ancre est avancée) ;
--   • phase 'settled' / 'blocked' / 'failed' — à l'issue du règlement.
--
-- Une ligne 'reserved' SANS ligne finale correspondante = la fonction a été tuée
-- en cours de route (dépassement de temps CPU, OOM…). C'est exactement le cas
-- qu'aucun try/catch ne peut rattraper, et la seule façon de le prouver.
--
-- Écrit par la fonction `resolve-deployment` (service_role). Lecture réservée au
-- joueur concerné ; l'exploitation se fait au SQL Editor.

create table if not exists public.claim_log (
  id            bigserial primary key,
  player_id     uuid not null references public.profiles (id) on delete cascade,
  deployment_id uuid,
  -- 'reserved' | 'settled' | 'blocked' | 'failed'
  phase         text not null,
  fights        int,
  wins          int,
  losses        int,
  gold          bigint,
  resources     jsonb,
  -- Durée du règlement de CE groupe, en ms (null sur 'reserved').
  duration_ms   int,
  -- Ancre avant/après : permet de recalculer le temps de farm reellement consommé.
  anchor_before timestamptz,
  error         text,
  created_at    timestamptz not null default now()
);

create index if not exists claim_log_player_idx on public.claim_log (player_id, created_at desc);
create index if not exists claim_log_phase_idx on public.claim_log (phase, created_at desc);

alter table public.claim_log enable row level security;

drop policy if exists "claim_log select own" on public.claim_log;
create policy "claim_log select own"
  on public.claim_log for select to authenticated
  using ((select auth.uid()) = player_id);

-- Purge : le journal est un outil de diagnostic, pas un historique de jeu.
-- À lancer ponctuellement (ou via un cron si le volume le justifie) :
--   delete from public.claim_log where created_at < now() - interval '14 days';
