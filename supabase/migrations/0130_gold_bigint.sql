-- 0130_gold_bigint.sql
-- Passe `profiles.gold` de `integer` à `bigint`.
--
-- Bug remonté : un joueur qui inflige > ~2,1 milliards de dégâts au Pantin
-- d'entraînement gagne autant d'or (1 dégât = 1 or). Le crédit dépassait alors le
-- plafond d'un `int` (2 147 483 647) → « integer out of range », la frappe du jour
-- était consommée sans récompense. La colonne `gold` était le seul maillon en
-- `int` (le score du pantin est déjà en `bigint`, et `add_player_gold` prend un
-- `bigint`) — c'est donc l'écriture dans `profiles.gold` qui débordait.
--
-- La vue `leaderboard` expose `p.gold` et la vue `guild_leaderboard` dépend de
-- `leaderboard` : Postgres refuse d'altérer le type d'une colonne référencée par
-- une vue, on les DROP puis on les RECRÉE à l'identique (définitions live,
-- `security_invoker = false` préservé).

drop view if exists public.guild_leaderboard;
drop view if exists public.leaderboard;

alter table public.profiles alter column gold type bigint;

create view public.leaderboard
with (security_invoker = false)
as
 WITH hero_stats AS (
         SELECT h.owner_id,
            h.level,
            h.alloc_hp,
            h.alloc_atk,
            h.alloc_def,
            h.alloc_speed,
            hc.base_hp,
            hc.base_atk,
            hc.base_def,
            hc.base_speed,
            COALESCE(w.atk_bonus, 0) + COALESCE(a.atk_bonus, 0) + COALESCE(j.atk_bonus, 0) + COALESCE(r.atk_bonus, 0) AS atk_bonus,
            COALESCE(w.def_bonus, 0) + COALESCE(a.def_bonus, 0) + COALESCE(j.def_bonus, 0) + COALESCE(r.def_bonus, 0) AS def_bonus,
            COALESCE(w.hp_bonus, 0) + COALESCE(a.hp_bonus, 0) + COALESCE(j.hp_bonus, 0) + COALESCE(r.hp_bonus, 0) AS hp_bonus
           FROM heroes h
             JOIN hero_classes hc ON hc.id = h.class_id
             LEFT JOIN items w ON w.id = h.equipped_weapon_id
             LEFT JOIN items a ON a.id = h.equipped_armor_id
             LEFT JOIN items j ON j.id = h.equipped_jewel_id
             LEFT JOIN items r ON r.id = h.equipped_relic_id
        ), hero_power AS (
         SELECT hero_stats.owner_id,
            (round(hero_stats.base_atk::numeric * (1::numeric + 0.05 * (hero_stats.level - 1)::numeric)) + hero_stats.atk_bonus::numeric + (hero_stats.alloc_atk * 2)::numeric) * 2::numeric + (round(hero_stats.base_def::numeric * (1::numeric + 0.05 * (hero_stats.level - 1)::numeric)) + hero_stats.def_bonus::numeric + (hero_stats.alloc_def * 2)::numeric) * 2::numeric + (round(hero_stats.base_hp::numeric * (1::numeric + 0.05 * (hero_stats.level - 1)::numeric)) + hero_stats.hp_bonus::numeric + (hero_stats.alloc_hp * 8)::numeric) * 4::numeric * 0.5 + (hero_stats.base_speed + hero_stats.alloc_speed)::numeric AS power
           FROM hero_stats
        ), ranked AS (
         SELECT hero_power.owner_id,
            hero_power.power,
            row_number() OVER (PARTITION BY hero_power.owner_id ORDER BY hero_power.power DESC) AS rn
           FROM hero_power
        ), player_power AS (
         SELECT ranked.owner_id,
            sum(ranked.power)::integer AS total_power
           FROM ranked
          WHERE ranked.rn <= 5
          GROUP BY ranked.owner_id
        ), player_levels AS (
         SELECT lp.player_id,
            count(*) AS levels_cleared,
            COALESCE(max(l.difficulty), 0) AS max_difficulty
           FROM level_progress lp
             JOIN levels l ON l.id = lp.level_id
          GROUP BY lp.player_id
        )
 SELECT p.id AS player_id,
    p.display_name,
    COALESCE(pp.total_power, 0) AS total_power,
    COALESCE(pl.levels_cleared, 0::bigint) AS levels_cleared,
    COALESCE(pl.max_difficulty, 0) AS max_difficulty,
    p.gold
   FROM profiles p
     LEFT JOIN player_power pp ON pp.owner_id = p.id
     LEFT JOIN player_levels pl ON pl.player_id = p.id;

create view public.guild_leaderboard
with (security_invoker = false)
as
 WITH member_stats AS (
         SELECT guild_members.guild_id,
            count(*) AS members,
            COALESCE(sum(guild_members.contribution), 0::bigint) AS contribution
           FROM guild_members
          GROUP BY guild_members.guild_id
        ), raid_stats AS (
         SELECT guild_raid_runs.guild_id,
            count(*) FILTER (WHERE guild_raid_runs.success) AS raids_cleared
           FROM guild_raid_runs
          GROUP BY guild_raid_runs.guild_id
        ), power_stats AS (
         SELECT gm.guild_id,
            COALESCE(sum(lb.total_power), 0::bigint) AS total_power
           FROM guild_members gm
             JOIN leaderboard lb ON lb.player_id = gm.player_id
          GROUP BY gm.guild_id
        )
 SELECT g.id AS guild_id,
    g.name,
    g.tag,
    g.emblem,
    g.xp,
    COALESCE(ms.members, 0::bigint) AS members,
    COALESCE(ms.contribution, 0::bigint) AS contribution,
    COALESCE(rs.raids_cleared, 0::bigint) AS raids_cleared,
    COALESCE(ps.total_power, 0::bigint) AS total_power
   FROM guilds g
     LEFT JOIN member_stats ms ON ms.guild_id = g.id
     LEFT JOIN raid_stats rs ON rs.guild_id = g.id
     LEFT JOIN power_stats ps ON ps.guild_id = g.id;
