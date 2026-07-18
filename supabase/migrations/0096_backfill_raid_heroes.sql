-- Reconstruit `result.heroes` (héros → classe + propriétaire) pour les raids de
-- guilde résolus AVANT que la fonction edge ne l'enregistre.
--
-- Sans cette carte, le client ne peut ni afficher la bonne classe des héros de
-- ses coéquipiers (RLS « select own » sur `heroes`) ni dire qui a engagé quoi :
-- la composition du raid restait vide et tous les héros s'affichaient en guerrier.
--
-- La donnée est reconstructible car `guild_raid_runs.hero_ids` conserve la liste
-- exacte des héros engagés. Un héros renvoyé depuis ne serait plus retrouvé — il
-- est alors simplement omis, ce qui est préférable à une carte fausse.

update public.guild_raid_runs r
set result = r.result || jsonb_build_object('heroes', (
  select coalesce(
    jsonb_agg(jsonb_build_object('id', h.id, 'class_id', h.class_id, 'owner_id', h.owner_id)),
    '[]'::jsonb
  )
  from public.heroes h
  where h.id = any(r.hero_ids)
))
where not (r.result ? 'heroes');
