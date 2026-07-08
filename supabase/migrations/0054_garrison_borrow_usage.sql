-- 0054_garrison_borrow_usage.sql
-- Bridage anti-carry des héros EMPRUNTÉS à la garnison de guilde : par emprunteur
-- et par jour civil (Europe/Paris), un héros emprunté ne peut servir qu'une fois
-- en donjon et 5 combats sur la carte. Compteur écrit par le service_role.

create table public.garrison_borrow_usage (
  borrower_player_id uuid not null references public.profiles (id) on delete cascade,
  hero_id            uuid not null references public.heroes (id) on delete cascade,
  usage_date         text not null,                 -- 'YYYY-MM-DD' (Europe/Paris)
  dungeon_runs       int  not null default 0,
  map_fights         int  not null default 0,
  primary key (borrower_player_id, hero_id, usage_date)
);

alter table public.garrison_borrow_usage enable row level security;

-- L'emprunteur peut lire sa propre consommation (affichage). Écriture = service_role.
create policy "garrison_borrow_usage select own" on public.garrison_borrow_usage
  for select to authenticated using (borrower_player_id = (select auth.uid()));
