-- 0071_arc_system.sql — FONDATION du système d'ARCS (New Game+ / régions).
--
-- Un arc = une "région" : MÊME carte du monde, difficulté et tier de loot au
-- palier au-dessus. Le roster / l'équipement / l'or / l'XP de compte sont
-- PARTAGÉS entre arcs ; seuls la PROGRESSION DE CARTE, le TIER de loot et la
-- DIFFICULTÉ changent. Les arcs sont des pistes PARALLÈLES switchables (on peut
-- revenir en arc 1) — ce n'est PAS un reset.
--
-- ⚠️ PHASE 1 = schéma seulement. Cette migration CHANGE des clés primaires
-- (player_resources, level_progress) → les Edge Functions qui font des upserts
-- `onConflict: 'player_id,resource'` / écrivent la progression DOIVENT être mises
-- à jour EN MÊME TEMPS (Phase 2) avant application en prod, sinon écritures KO.
-- Rien n'est appliqué tant que le lot complet n'est pas prêt.

-- -----------------------------------------------------------------------------
-- 1) TIER sur les objets (T1 = arc 1, T2 = arc 2, …). Existant → T1.
-- -----------------------------------------------------------------------------
alter table public.items
  add column if not exists tier int not null default 1 check (tier >= 1);

-- -----------------------------------------------------------------------------
-- 2) TIER dans l'IDENTITÉ des ressources : (player_id, resource, tier).
--    Même clé `ecorce`, mais T1 et T2 sont des piles DISTINCTES. Extensible ∞.
-- -----------------------------------------------------------------------------
alter table public.player_resources
  add column if not exists tier int not null default 1 check (tier >= 1);

alter table public.player_resources drop constraint if exists player_resources_pkey;
alter table public.player_resources
  add constraint player_resources_pkey primary key (player_id, resource, tier);

-- -----------------------------------------------------------------------------
-- 3) ARC sur la PROGRESSION DE CARTE (piste parallèle : progression par arc).
-- -----------------------------------------------------------------------------
alter table public.level_progress
  add column if not exists arc int not null default 1 check (arc >= 1);

alter table public.level_progress drop constraint if exists level_progress_pkey;
alter table public.level_progress
  add constraint level_progress_pkey primary key (player_id, level_id, arc);

-- Déploiements (farm/carte) : rattachés à un arc (un déploiement ne vaut que dans
-- son arc). Existant → arc 1.
alter table public.deployments
  add column if not exists arc int not null default 1 check (arc >= 1);
create index if not exists deployments_player_arc_idx on public.deployments (player_id, arc);

-- -----------------------------------------------------------------------------
-- 4) FRONT DU SERVEUR : quels arcs sont OUVERTS (par l'event de boss d'arc).
--    Un arc s'ouvre quand la communauté tue son boss ; il reste ouvert à jamais.
-- -----------------------------------------------------------------------------
create table if not exists public.arc_world (
  arc        int primary key check (arc >= 1),
  opened     boolean not null default false,
  opened_at  timestamptz
);
-- Arc 1 est ouvert dès le départ.
insert into public.arc_world (arc, opened, opened_at)
  values (1, true, now())
  on conflict (arc) do nothing;

-- -----------------------------------------------------------------------------
-- 5) CONTEXTE D'ARC DU JOUEUR : arc actuellement sélectionné + arc max débloqué.
--    `max_arc` = plus haut arc où le joueur a le droit d'entrer (serveur a ouvert
--    l'arc ET le joueur a fini la carte de l'arc précédent). Piloté côté serveur.
-- -----------------------------------------------------------------------------
create table if not exists public.player_arc (
  player_id   uuid primary key references public.profiles (id) on delete cascade,
  current_arc int not null default 1 check (current_arc >= 1),
  max_arc     int not null default 1 check (max_arc >= 1),
  updated_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.arc_world  enable row level security;
alter table public.player_arc enable row level security;

create policy "arc_world readable by authenticated"
  on public.arc_world for select to authenticated using (true);

-- Le joueur LIT son contexte d'arc ; il peut CHANGER d'arc courant (dans la limite
-- de max_arc, garde applicative + serveur). max_arc n'est jamais écrit par le client.
create policy "player_arc select own"
  on public.player_arc for select to authenticated
  using ((select auth.uid()) = player_id);
