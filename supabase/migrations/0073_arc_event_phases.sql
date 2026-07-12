-- 0073_arc_event_phases.sql — Refonte de l'event de boss d'arc en PHASES.
--
-- Nouveau cycle : cloche sonnée → PRÉPARATION (~1 j, boss « en approche ») →
-- INVOCATION (le boss apparaît, frappable) → FENÊTRE DE COMBAT (~3 j). Chaque
-- joueur frappe toutes les 3 h. Si le boss n'est pas tué avant l'échéance, il
-- SE RETIRE (expired) — PLUS de kill garanti : il faut le tuer pour ouvrir l'arc,
-- sinon on re-sonne la cloche. Tables 0072 vidées et recréées (aucun event encore joué).

drop table if exists public.arc_event_hits;
drop table if exists public.arc_events;

-- -----------------------------------------------------------------------------
-- L'event (au plus un VIVANT — pending|active — par arc cible).
-- -----------------------------------------------------------------------------
create table public.arc_events (
  id               uuid primary key default gen_random_uuid(),
  target_arc       int  not null check (target_arc >= 2),
  status           text not null default 'pending'
                     check (status in ('pending', 'active', 'defeated', 'expired')),
  boss_name        text not null,
  hp_max           bigint not null check (hp_max > 0),
  hp_current       bigint not null,
  eligible_count   int  not null,
  monster_sequence jsonb not null,
  summoned_by      uuid references public.profiles (id) on delete set null,
  summoned_at      timestamptz not null default now(),
  invoke_at        timestamptz not null,   -- fin de la préparation → le boss apparaît
  deadline         timestamptz not null,   -- fin de la fenêtre de combat (invoke_at + N j)
  defeated_at      timestamptz,
  ended_at         timestamptz             -- tué OU retiré
);
create unique index arc_events_one_live on public.arc_events (target_arc)
  where status in ('pending', 'active');

-- -----------------------------------------------------------------------------
-- Contributions : JOURNAL append-only (cooldown de 3 h vérifié sur created_at).
-- -----------------------------------------------------------------------------
create table public.arc_event_hits (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.arc_events (id) on delete cascade,
  player_id  uuid not null references public.profiles (id) on delete cascade,
  damage     bigint not null default 0,
  created_at timestamptz not null default now()
);
create index arc_event_hits_event_idx on public.arc_event_hits (event_id);
create index arc_event_hits_cooldown_idx on public.arc_event_hits (event_id, player_id, created_at desc);

-- -----------------------------------------------------------------------------
-- RLS : lecture publique authentifiée (barre de PV + classement). Écriture
-- réservée à l'Edge Function `arc-event` (service_role).
-- -----------------------------------------------------------------------------
alter table public.arc_events     enable row level security;
alter table public.arc_event_hits enable row level security;

create policy "arc_events readable by authenticated"
  on public.arc_events for select to authenticated using (true);
create policy "arc_event_hits readable by authenticated"
  on public.arc_event_hits for select to authenticated using (true);
