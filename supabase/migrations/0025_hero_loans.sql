-- 0025_hero_loans.sql
-- Prêt de héros (hero sharing) : un joueur emprunte le héros d'un autre pour une
-- activité (donjon/expédition) via un SNAPSHOT figé en lecture seule. Le héros
-- original n'est ni déplacé ni modifié ; son propriétaire continue de l'utiliser.
--
-- Conventions projet : ownership = *_player_id -> profiles(id) (pas auth.users).
-- `activity_id` est une référence POLYMORPHE (expedition_runs | dungeon_runs selon
-- activity_type) → volontairement SANS FK (une FK unique ne peut pas cibler deux
-- tables). RLS SELECT-only ; toutes les écritures passent par les Edge Functions.

create table public.hero_loans (
  id                 uuid primary key default gen_random_uuid(),
  owner_player_id    uuid not null references public.profiles (id) on delete cascade,
  hero_id            uuid not null references public.heroes (id) on delete cascade,
  borrower_player_id uuid not null references public.profiles (id) on delete cascade,
  hero_snapshot      jsonb not null,          -- stats figées (= CombatantInput) au moment de l'emprunt
  activity_type      text not null check (activity_type in ('expedition', 'dungeon')),
  activity_id        uuid not null,           -- réf polymorphe (expedition_runs|dungeon_runs) — pas de FK
  created_at         timestamptz not null default now(),
  expires_at         timestamptz not null
);

create index hero_loans_borrower_idx on public.hero_loans (borrower_player_id);
create index hero_loans_owner_idx    on public.hero_loans (owner_player_id);
-- Empêche l'emprunt simultané d'un même héros : recherche rapide des prêts d'un héros
-- (l'unicité « un seul prêt actif » est vérifiée applicativement, `expires_at` étant temporel).
create index hero_loans_hero_idx     on public.hero_loans (hero_id);

alter table public.hero_loans enable row level security;

-- Un joueur ne voit QUE les prêts où il est propriétaire OU emprunteur.
-- Aucune policy insert/update/delete → le client ne peut jamais écrire un prêt.
create policy "hero_loans select own or borrowed"
  on public.hero_loans for select to authenticated
  using (
    (select auth.uid()) = owner_player_id
    or (select auth.uid()) = borrower_player_id
  );
