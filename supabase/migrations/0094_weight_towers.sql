-- Tours par POIDS (léger / moyen / lourd) au lieu de tours par CLASSE.
--
-- Pourquoi : le découpage par classe (migration 0067) listait 5 classes en dur.
-- Les 3 classes ajoutées en V2 (voleur, necromancien, inquisiteur) n'avaient donc
-- AUCUNE tour et étaient rejetées par la fonction edge. La correspondance
-- classe → poids étant totale, indexer sur le poids donne une tour à toute classe,
-- présente comme future.
--
-- Fusion 5 → 3 : on prend le MAX des meilleurs étages des classes d'un même poids.
-- Le MAX est le SEUL choix sûr : les étages paient une seule fois (montée à partir
-- de best_floor + 1), donc retenir un étage plus BAS que ce qu'un joueur a déjà
-- franchi lui ferait re-toucher des récompenses déjà versées.

create table if not exists public.weight_tower_progress (
  player_id  uuid not null references public.profiles (id) on delete cascade,
  weight     text not null check (weight in ('light', 'medium', 'heavy')),
  arc        int not null default 1 check (arc >= 1),
  best_floor integer not null default 0 check (best_floor >= 0),
  updated_at timestamptz not null default now(),
  primary key (player_id, weight, arc)
);

alter table public.weight_tower_progress enable row level security;

-- Lecture par le propriétaire uniquement ; toutes les écritures passent par la
-- fonction edge en service_role (aucune policy insert/update/delete, comme 0067).
drop policy if exists "weight_tower_progress readable by owner" on public.weight_tower_progress;
create policy "weight_tower_progress readable by owner"
  on public.weight_tower_progress for select to authenticated
  using (player_id = (select auth.uid()));

-- Reprise de l'existant. `hero_classes.weight` porte déjà la correspondance
-- (migration 0074) et fait autorité côté SQL.
insert into public.weight_tower_progress (player_id, weight, arc, best_floor)
select p.player_id, hc.weight, p.arc, max(p.best_floor)
from public.class_tower_progress p
join public.hero_classes hc on hc.id = p.class_id
where hc.weight in ('light', 'medium', 'heavy')
group by p.player_id, hc.weight, p.arc
on conflict (player_id, weight, arc)
  do update set best_floor = greatest(public.weight_tower_progress.best_floor, excluded.best_floor);

-- `class_tower_progress` est volontairement CONSERVÉE (non droppée) : filet de
-- sécurité si la fusion devait être rejouée ou auditée. À supprimer dans une
-- migration ultérieure une fois les tours par poids éprouvées.

comment on table public.weight_tower_progress is
  'Progression des Tours, une par poids d''équipement. Remplace class_tower_progress (0067).';
