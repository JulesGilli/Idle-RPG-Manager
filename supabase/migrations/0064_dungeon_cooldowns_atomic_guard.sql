-- Verrou atomique anti multi-onglets pour les donjons.
--
-- Le cooldown des donjons se lisait dans l'historique APPEND-ONLY dungeon_runs
-- (created_at du dernier run) : aucune ligne mutable sur laquelle un UPDATE
-- conditionnel puisse sérialiser des requêtes concurrentes. Résultat : N onglets
-- lançant le même donjon en parallèle passaient tous le check de cooldown et
-- doublaient le loot.
--
-- Cette table porte le SEUL état mutable par (joueur, type de donjon). L'Edge
-- Function resolve-dungeon-run fait un compare-and-swap dessus (avancer last_run_at
-- à maintenant UNIQUEMENT si le cooldown est écoulé) AVANT de créditer : Postgres
-- sérialise la ligne, un seul UPDATE passe, les autres reçoivent un 429.
-- dungeon_runs reste l'historique/replay (append-only) et la source d'affichage.

create table if not exists public.dungeon_cooldowns (
  player_id       uuid not null references public.profiles (id) on delete cascade,
  dungeon_type_id text not null references public.dungeon_types (id),
  last_run_at     timestamptz not null default now(),
  primary key (player_id, dungeon_type_id)
);

alter table public.dungeon_cooldowns enable row level security;

-- Lecture : chaque joueur ne voit que ses propres cooldowns (affichage client).
-- Aucune policy insert/update/delete → seule l'Edge Function resolve-dungeon-run
-- (service_role, bypass RLS) écrit dans cette table.
-- (drop-if-exists pour rester idempotent : la migration a été appliquée en prod
--  via l'outil MCP, un futur `db push` pourrait la re-jouer sans dommage.)
drop policy if exists "dungeon_cooldowns readable by owner" on public.dungeon_cooldowns;
create policy "dungeon_cooldowns readable by owner"
  on public.dungeon_cooldowns for select to authenticated
  using (player_id = auth.uid());
