-- 0111_battlefields.sql — CHAMPS DE BATAILLE (Arc 2, batailles rangées 10v10).
--
-- Concept : le joueur engage JUSQU'À 10 héros (au lieu de 5 partout ailleurs) face
-- à une armée de 10. Six batailles de difficulté croissante, débloquées
-- séquentiellement (gagner la n ouvre la n+1). Quota de 4 sorties par JOUR, toutes
-- batailles confondues. La victoire paie en Poussière bénie — seule source de la
-- matière de l'ARMURE divine (cf. shared/progression/battlefield.ts).
--
-- Combat résolu côté serveur (Edge Function `resolve-battlefield`, service_role) :
-- le client ne fait que lire. Aucune écriture client.

-- -----------------------------------------------------------------------------
-- Une sortie = une ligne. La clé primaire (player_id, run_day, slot) est le
-- VERROU ANTI-MULTI-ONGLETS : `slot` est borné à [1..4], donc la base ne peut
-- physiquement pas contenir plus de 4 sorties par joueur et par jour. Deux onglets
-- qui lancent une bataille en même temps calculent le même slot ; l'un insère,
-- l'autre se prend une violation de clé (23505) et repart sans récompense.
-- C'est ce qui rend le crédit de butin idempotent — pas le comptage applicatif.
--
-- ⚠️ La borne `slot <= 4` DOIT bouger avec `BATTLEFIELD_DAILY_CAP`
-- (shared/progression/battlefield.ts). Les deux se contredisant, c'est la base qui
-- gagne — et le joueur perdrait des sorties sans message clair.
-- -----------------------------------------------------------------------------
create table if not exists public.battlefield_runs (
  player_id       uuid not null references public.profiles (id) on delete cascade,
  run_day         text not null,                       -- jour Paris 'YYYY-MM-DD' (horloge serveur)
  slot            int  not null check (slot between 1 and 4),
  battlefield_id  text not null,                       -- id de BATTLEFIELDS
  battlefield_idx int  not null,                       -- rang de difficulté (progression)
  won             boolean not null,
  dust            int  not null default 0,             -- poussiere_benie créditée
  gold            int  not null default 0,
  created_at      timestamptz not null default now(),
  primary key (player_id, run_day, slot)
);

-- Progression : plus haut palier VAINCU (max(battlefield_idx) where won).
create index if not exists battlefield_runs_progress_idx
  on public.battlefield_runs (player_id, battlefield_idx desc) where won;

-- Quota du jour : comptage des sorties d'un joueur pour une journée.
create index if not exists battlefield_runs_day_idx
  on public.battlefield_runs (player_id, run_day);

-- -----------------------------------------------------------------------------
-- Crédit ATOMIQUE d'une ressource à un tier donné. Le motif lecture-puis-upsert
-- utilisé ailleurs perd des crédits en concurrence ; ici l'incrément se fait en
-- une seule instruction. Réservé à l'Edge Function (service_role).
-- -----------------------------------------------------------------------------
create or replace function public.add_player_resource(
  p_player   uuid,
  p_resource text,
  p_amount   int,
  p_tier     int
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.player_resources (player_id, resource, amount, tier)
  values (p_player, p_resource, greatest(0, p_amount), p_tier)
  on conflict (player_id, resource, tier)
  do update set amount = public.player_resources.amount + greatest(0, p_amount);
$$;
revoke all on function public.add_player_resource(uuid, text, int, int) from public;

-- -----------------------------------------------------------------------------
-- RLS : un joueur ne lit QUE ses propres sorties (quota + progression).
-- Aucune policy d'écriture : seule l'Edge Function (service_role) écrit.
-- -----------------------------------------------------------------------------
alter table public.battlefield_runs enable row level security;

create policy "battlefield_runs readable by owner"
  on public.battlefield_runs for select to authenticated using (player_id = auth.uid());
