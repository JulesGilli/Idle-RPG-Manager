-- Ajoute la PUISSANCE TOTALE d'une guilde (somme de la puissance de ses membres)
-- à la vue guild_leaderboard. La puissance par joueur = celle de la vue
-- leaderboard (somme des 5 meilleurs héros), donc cohérente avec le classement
-- joueurs. Colonne ajoutée EN FIN (create or replace view l'exige).
create or replace view public.guild_leaderboard
with (security_invoker = false)
as
with member_stats as (
  select guild_id, count(*) as members, coalesce(sum(contribution), 0) as contribution
  from public.guild_members group by guild_id
),
raid_stats as (
  select guild_id, count(*) filter (where success) as raids_cleared
  from public.guild_raid_runs group by guild_id
),
power_stats as (
  select gm.guild_id, coalesce(sum(lb.total_power), 0) as total_power
  from public.guild_members gm
  join public.leaderboard lb on lb.player_id = gm.player_id
  group by gm.guild_id
)
select
  g.id as guild_id,
  g.name,
  g.tag,
  g.emblem,
  g.xp,
  coalesce(ms.members, 0)        as members,
  coalesce(ms.contribution, 0)   as contribution,
  coalesce(rs.raids_cleared, 0)  as raids_cleared,
  coalesce(ps.total_power, 0)    as total_power
from public.guilds g
left join member_stats ms on ms.guild_id = g.id
left join raid_stats   rs on rs.guild_id = g.id
left join power_stats  ps on ps.guild_id = g.id;

grant select on public.guild_leaderboard to anon, authenticated;
