-- 0072_arc_event.sql — PHASE 3 : event de boss d'arc COMMUNAUTAIRE.
--
-- « La Cloche du Désespoir » : quand assez de joueurs ont fini la carte du monde,
-- un boss colossal à PV PARTAGÉS est invoqué. Chaque joueur peut le frapper 1×/jour
-- (vrai combat, dégâts versés au pool commun). Sa mort (ou l'échéance = kill garanti)
-- ouvre l'arc suivant POUR TOUT LE SERVEUR (arc_world.opened) et débloque
-- player_arc.max_arc des joueurs éligibles. Déblocage global : les retardataires
-- ne sont jamais bloqués (ils entrent dès qu'ils ont fini la carte).

-- -----------------------------------------------------------------------------
-- L'event (un seul ACTIF par arc cible à la fois).
-- -----------------------------------------------------------------------------
create table public.arc_events (
  id               uuid primary key default gen_random_uuid(),
  target_arc       int  not null check (target_arc >= 2),   -- l'arc que sa mort débloque
  status           text not null default 'active' check (status in ('active', 'defeated')),
  boss_name        text not null,
  hp_max           bigint not null check (hp_max > 0),
  hp_current       bigint not null,
  eligible_count   int  not null,                           -- éligibles figés à l'invocation
  monster_sequence jsonb not null,                          -- combat (moteur donjon)
  summoned_by      uuid references public.profiles (id) on delete set null,
  summoned_at      timestamptz not null default now(),
  deadline         timestamptz not null,                    -- kill garanti à cette échéance
  defeated_at      timestamptz
);
-- Au plus UN event actif par arc cible.
create unique index arc_events_one_active on public.arc_events (target_arc) where status = 'active';

-- -----------------------------------------------------------------------------
-- Contributions : 1 frappe / jour (Paris) / joueur.
-- -----------------------------------------------------------------------------
create table public.arc_event_hits (
  event_id   uuid not null references public.arc_events (id) on delete cascade,
  player_id  uuid not null references public.profiles (id) on delete cascade,
  day        date   not null,                               -- jour Paris de la frappe
  damage     bigint not null default 0,
  created_at timestamptz not null default now(),
  primary key (event_id, player_id, day)
);
create index arc_event_hits_event_idx on public.arc_event_hits (event_id);

-- -----------------------------------------------------------------------------
-- RLS : lecture publique authentifiée (barre de PV + classement). Aucune écriture
-- client : seule l'Edge Function `arc-event` (service_role) écrit.
-- -----------------------------------------------------------------------------
alter table public.arc_events     enable row level security;
alter table public.arc_event_hits enable row level security;

create policy "arc_events readable by authenticated"
  on public.arc_events for select to authenticated using (true);
create policy "arc_event_hits readable by authenticated"
  on public.arc_event_hits for select to authenticated using (true);
