-- RESSOURCES MUTUALISÉES ENTRE ARCS — fusion des tas existants.
--
-- `plume_appel` (reroll de Taverne) et `larme_astrale` (bénédiction d'arme,
-- éveil, runes) servent dans les DEUX arcs. Ne pas leur donner de jumeau ne
-- suffisait pas : `player_resources` est indexé par `(player_id, resource,
-- tier)`, et le tier vaut l'arc. Elles se retrouvaient donc en deux tas —
-- gagnées en arc 2, invisibles et indépensables pour qui y était passé, et
-- inversement.
--
-- Le code les épingle désormais au tier 1 (`resourceTier`). Cette migration
-- rapatrie ce qui traîne aux tiers supérieurs, sans rien perdre.

-- 1) Verse les soldes des tiers > 1 sur la ligne de tier 1 (créée au besoin).
insert into public.player_resources (player_id, resource, tier, amount)
select player_id, resource, 1, sum(amount)
  from public.player_resources
 where resource in ('plume_appel', 'larme_astrale')
   and tier > 1
   and amount > 0
 group by player_id, resource
on conflict (player_id, resource, tier)
do update set amount = public.player_resources.amount + excluded.amount;

-- 2) Supprime les lignes désormais vides de sens (le code n'y écrira plus).
delete from public.player_resources
 where resource in ('plume_appel', 'larme_astrale')
   and tier > 1;
