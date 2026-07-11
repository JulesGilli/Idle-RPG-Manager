-- V1.1 : les Tours par classe.
--
-- La Tour devient 5 tours SOLO, une par classe (paladin/guerrier/archer/mage/
-- soigneur). Chaque joueur a donc une progression (meilleur étage) PAR CLASSE.
-- L'ancienne `tower_progress` (un seul best_floor, toutes classes confondues) ne
-- mappe pas proprement sur 5 tours → on repart de 0 sur les 5 nouvelles tours.
--
-- Comme les autres tables de progression : écrite uniquement par l'Edge Function
-- resolve-tower (service_role) ; le joueur lit seulement la sienne.
create table if not exists public.class_tower_progress (
  player_id  uuid not null references public.profiles (id) on delete cascade,
  class_id   text not null references public.hero_classes (id),
  best_floor integer not null default 0 check (best_floor >= 0),
  updated_at timestamptz not null default now(),
  primary key (player_id, class_id)
);

alter table public.class_tower_progress enable row level security;

create policy "class_tower_progress readable by owner"
  on public.class_tower_progress for select to authenticated
  using (player_id = auth.uid());
