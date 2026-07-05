-- 0033_arc_bosses.sql
-- BOSS D'ARC : une rencontre spéciale (hors farm de carte) qui clôt un arc. La
-- vaincre débloque l'arc suivant ET son tier de matériaux de craft. La séquence
-- de combats réutilise le moteur de donjon (simulateDungeonRun), résolue côté
-- serveur uniquement (anti-triche) ; le client ne fait que rejouer le résultat.

-- -----------------------------------------------------------------------------
-- Table de référence (lecture publique authentifiée), calquée sur dungeon_types.
-- -----------------------------------------------------------------------------
create table public.arc_bosses (
  id                       text primary key,
  arc_id                   text not null,
  name                     text not null,
  tier                     int  not null default 1,
  -- Tier de matériaux débloqué en le battant (pour l'affichage / messages).
  unlocks_tier             int  not null,
  -- Dernière zone de l'arc : elle doit être terminée pour tenter le boss d'arc.
  required_level_id        text references public.levels (id),
  monster_sequence         jsonb   not null,
  regen_pct_between_fights numeric not null default 0.15
                             check (regen_pct_between_fights >= 0 and regen_pct_between_fights <= 1),
  miniboss_indices         int[] not null default '{}',
  boss_index               int   not null check (boss_index >= 0),
  loot_table_normal        jsonb not null default '[]'::jsonb,
  loot_table_miniboss      jsonb not null default '[]'::jsonb,
  loot_table_boss          jsonb not null default '[]'::jsonb
);

-- -----------------------------------------------------------------------------
-- Progression joueur : boss d'arc vaincus (débloque les tiers de matériaux).
-- -----------------------------------------------------------------------------
create table public.player_arc_progress (
  player_id    uuid not null references public.profiles (id) on delete cascade,
  gate_boss_id text not null references public.arc_bosses (id),
  cleared_at   timestamptz not null default now(),
  primary key (player_id, gate_boss_id)
);

create index player_arc_progress_player_idx on public.player_arc_progress (player_id);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.arc_bosses          enable row level security;
alter table public.player_arc_progress enable row level security;

create policy "arc_bosses readable by authenticated"
  on public.arc_bosses for select to authenticated using (true);

-- Chaque joueur ne lit QUE sa propre progression. Aucune policy insert/update/
-- delete → seule la Edge Function resolve-arc-boss (service_role) écrit la victoire.
create policy "player_arc_progress select own"
  on public.player_arc_progress for select to authenticated
  using ((select auth.uid()) = player_id);

-- -----------------------------------------------------------------------------
-- Seed : boss de l'Arc 1 (tier 1 → débloque le tier 2). Deux combats : la garde
-- puis le colosse. Tenable par une escouade ayant fini les Cavernes.
-- -----------------------------------------------------------------------------
insert into public.arc_bosses
  (id, arc_id, name, tier, unlocks_tier, required_level_id, monster_sequence, boss_index, loot_table_boss)
values (
  'arc1_gate', 'arc1', 'Le Colosse des Marches', 1, 2, 'caverns_5',
  '[
     {"name":"Gardiens du Seuil","enemies":[
        {"name":"Gardien de pierre","hp":260,"atk":26,"def":12,"speed":10},
        {"name":"Gardien de pierre","hp":260,"atk":26,"def":12,"speed":10}]},
     {"name":"Le Colosse des Marches","enemies":[
        {"name":"Colosse","hp":820,"atk":42,"def":18,"speed":9}]}
   ]'::jsonb,
  1,
  '[{"resource":"essence_astrale","min":1,"max":2,"chance":1}]'::jsonb
)
on conflict (id) do update set
  name = excluded.name,
  unlocks_tier = excluded.unlocks_tier,
  required_level_id = excluded.required_level_id,
  monster_sequence = excluded.monster_sequence,
  boss_index = excluded.boss_index,
  loot_table_boss = excluded.loot_table_boss;
