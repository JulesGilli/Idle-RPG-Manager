-- 0115_dungeon_cooldown_per_arc.sql — cooldown des donjons NON partagé entre arcs.
--
-- Bug remonté : les 8 donjons sont REJOUÉS à l'identique en Arc 2 (même
-- `dungeon_type_id`, stats scalées à l'arc). Le cooldown (`dungeon_cooldowns`,
-- clé (player_id, dungeon_type_id)) et l'éligibilité au skip (`dungeon_runs`,
-- lu par `dungeon_type_id`) ne distinguaient donc pas l'arc : lancer les
-- Catacombes en Arc 1 mettait AUSSI en cooldown les Catacombes d'Arc 2 (et
-- inversement), et un clear en Arc 1 débloquait le skip en Arc 2 sans l'avoir
-- jamais fait là-bas. Ce sont deux donjons différents pour le joueur — même
-- valeur de cooldown, mais des horloges indépendantes par arc.
--
-- Additif, non destructeur : nouvelle colonne `arc` (défaut 1, donc les lignes
-- existantes restent valides pour l'Arc 1 sans backfill).

alter table public.dungeon_cooldowns add column if not exists arc int not null default 1;
alter table public.dungeon_runs      add column if not exists arc int not null default 1;

-- Reclé la PK de dungeon_cooldowns pour inclure l'arc (une ligne par joueur ×
-- donjon × arc, au lieu de joueur × donjon).
alter table public.dungeon_cooldowns drop constraint if exists dungeon_cooldowns_pkey;
alter table public.dungeon_cooldowns add primary key (player_id, dungeon_type_id, arc);

-- L'ancien index (player_id, dungeon_type_id) ne sert plus les lectures
-- arc-scopées : remplacé par un index couvrant les trois colonnes.
drop index if exists public.dungeon_runs_dungeon_type_id_idx;
create index if not exists dungeon_runs_player_dungeon_arc_idx
  on public.dungeon_runs (player_id, dungeon_type_id, arc);
