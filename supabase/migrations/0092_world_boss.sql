-- 0092_world_boss.sql — SCAFFOLD du BOSS DE LA SEMAINE (à finir).
--
-- Concept (spec Jules) : en semaine, un boss COMMUNAUTAIRE et IMMORTEL. Chaque
-- joueur ne peut le frapper QU'UNE FOIS par cycle (par semaine). Les dégâts de
-- tous s'additionnent (`total_damage`). À chaque PALIER de dégâts collectifs
-- franchi, une récompense se débloque POUR TOUT LE MONDE. En fin de semaine, le
-- CLASSEMENT individuel (somme des dégâts) distribue un TITRE temporaire qui
-- donne un % de stats pendant la semaine suivante.
--
-- Différences avec `arc_events` (dont on s'inspire) :
--   - pas de pool de PV : le boss est immortel, on cumule les dégâts (`total_damage`).
--   - 1 frappe / SEMAINE / joueur (PK sans `day`) au lieu de 1 / jour.
--   - récompenses par PALIER de dégâts, pas au kill.
--   - titre de classement à expiration (nouvelle table `player_event_titles`).
--
-- Reste à câbler (voir supabase/functions/world-boss/index.ts) :
--   [ ] payout des paliers communs (crédit ressources/cosmétiques)
--   [ ] finalisation hebdo : figer le classement + attribuer les titres (cron)
--   [ ] application du % de stats du titre en combat (voir TODO plus bas)

-- -----------------------------------------------------------------------------
-- L'event de la semaine (un seul actif à la fois).
-- -----------------------------------------------------------------------------
create table if not exists public.world_boss_events (
  id               uuid primary key default gen_random_uuid(),
  week_key         text not null,                           -- ex. '2026-W29' (identifie la semaine)
  boss_name        text not null,
  monster_sequence jsonb not null,                          -- combat (moteur donjon/combat)
  total_damage     bigint not null default 0,               -- dégâts collectifs cumulés
  tiers_unlocked   int  not null default 0,                 -- nb de paliers communs déjà franchis
  status           text not null default 'active' check (status in ('active', 'ended')),
  started_at       timestamptz not null default now(),
  ends_at          timestamptz not null,                    -- fin de semaine → finalisation
  ended_at         timestamptz
);
-- Au plus UN event actif à la fois.
create unique index if not exists world_boss_one_active
  on public.world_boss_events (status) where status = 'active';
create unique index if not exists world_boss_week_key
  on public.world_boss_events (week_key);

-- -----------------------------------------------------------------------------
-- Contributions : 1 frappe / SEMAINE / joueur (PK event+player, sans jour).
-- -----------------------------------------------------------------------------
create table if not exists public.world_boss_hits (
  event_id   uuid not null references public.world_boss_events (id) on delete cascade,
  player_id  uuid not null references public.profiles (id) on delete cascade,
  damage     bigint not null default 0,
  created_at timestamptz not null default now(),
  primary key (event_id, player_id)                         -- ⇒ une seule frappe par joueur/event
);
create index if not exists world_boss_hits_event_idx
  on public.world_boss_hits (event_id, damage desc);        -- classement = tri par damage

-- -----------------------------------------------------------------------------
-- Titres de classement à EXPIRATION : donnent un % de stats la semaine suivante.
-- Écrit par la finalisation hebdo ; lu en combat (TODO d'application ci-dessous).
-- -----------------------------------------------------------------------------
create table if not exists public.player_event_titles (
  player_id  uuid primary key references public.profiles (id) on delete cascade,
  title      text   not null,                               -- ex. 'Fléau de la semaine'
  stat_mult  numeric not null default 1,                    -- ex. 1.05 = +5% de stats
  source     text   not null default 'world_boss',
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null                           -- fin de la semaine suivante
);

-- -----------------------------------------------------------------------------
-- Config des PALIERS communs (réutilisée chaque semaine). Seuil de dégâts
-- cumulés → récompense décrite en JSON. Éditable via le Table Editor.
-- -----------------------------------------------------------------------------
create table if not exists public.world_boss_tier_defs (
  idx        int primary key,                               -- ordre (1,2,3…)
  threshold  bigint not null,                               -- dégâts collectifs requis
  reward     jsonb  not null                                -- ex. {"gold": 5000, "material": "…"}
);

insert into public.world_boss_tier_defs (idx, threshold, reward) values
  (1, 1000000,  '{"gold": 5000}'),
  (2, 5000000,  '{"gold": 15000}'),
  (3, 20000000, '{"gold": 50000}')
on conflict (idx) do nothing;

-- -----------------------------------------------------------------------------
-- RLS : lecture publique authentifiée (jauge de dégâts + classement + paliers).
-- Aucune écriture client : seule l'Edge Function `world-boss` (service_role) écrit.
-- -----------------------------------------------------------------------------
alter table public.world_boss_events    enable row level security;
alter table public.world_boss_hits      enable row level security;
alter table public.player_event_titles  enable row level security;
alter table public.world_boss_tier_defs enable row level security;

create policy "world_boss_events readable by authenticated"
  on public.world_boss_events for select to authenticated using (true);
create policy "world_boss_hits readable by authenticated"
  on public.world_boss_hits for select to authenticated using (true);
create policy "world_boss_tier_defs readable by authenticated"
  on public.world_boss_tier_defs for select to authenticated using (true);
-- Un joueur ne lit QUE son propre titre (évite de divulguer le classement figé
-- avant l'annonce ; le leaderboard public passe par world_boss_hits).
create policy "player_event_titles readable by owner"
  on public.player_event_titles for select to authenticated using (player_id = auth.uid());

-- -----------------------------------------------------------------------------
-- TODO (Jules, ce soir) — application du % de stats du titre en combat :
--   Point d'accroche le plus propre = le canal des buffs de guilde déjà threadé
--   partout (`applyCombatBuff` dans shared/progression/guildSkills.ts, appelé
--   dans buildAllies de resolve-deployment / arc-event / resolve-arc-boss…),
--   OU post-multiplication de `effectiveStats` (shared/progression/formulas.ts).
--   Les Edge Functions liraient player_event_titles (expires_at > now()) et
--   composeraient `stat_mult` dans le buff de combat de l'appelant.
-- -----------------------------------------------------------------------------
