-- 0123_arena_attack_team.sql
-- Arène : équipe d'ATTAQUE distincte de l'équipe de DÉFENSE.
--
-- Jusqu'ici `team_hero_ids` servait aux deux : la compo qu'on dépose en défense
-- était aussi celle qui partait au défi. Les deux rôles n'ont pourtant pas les
-- mêmes besoins (la défense est un snapshot figé qui encaisse, l'attaque se
-- règle contre l'adversaire du moment), et surtout : changer d'attaquants
-- obligeait à affaiblir sa propre défense.
--
-- `attack_hero_ids` vide = repli sur la défense → comportement historique
-- inchangé pour tous les joueurs déjà inscrits, aucun backfill nécessaire.
--
-- Volontairement ABSENT de la vue publique `arena_ladder` : la compo de défense
-- y est exposée (c'est elle qu'on affronte), la compo d'attaque non — la
-- publier reviendrait à montrer son jeu avant de l'abattre.

alter table public.arena_entries
  add column if not exists attack_hero_ids uuid[] not null default '{}';
