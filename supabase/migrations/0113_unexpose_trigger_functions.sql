-- -----------------------------------------------------------------------------
-- Retire de l'API les fonctions qui retournent `trigger`.
--
-- PostgREST expose TOUTE fonction de `public` que le rôle peut exécuter, y
-- compris celles qui n'ont de sens que branchées à un trigger. Elles étaient
-- donc listées sur `/rest/v1/rpc/…`. L'appel direct échoue (Postgres refuse
-- d'exécuter une fonction trigger hors contexte), le risque réel est donc
-- faible — mais une surface d'API qui n'a aucune raison d'exister se ferme.
--
-- Révoquer EXECUTE NE DÉSACTIVE PAS les gardes : au déclenchement d'un trigger,
-- Postgres ne vérifie pas le privilège EXECUTE sur la fonction (c'est le droit
-- TRIGGER sur la table qui est contrôlé, et la fonction s'exécute au nom du
-- propriétaire). VÉRIFIÉ EN BASE après application : une 4ᵉ composition d'équipe
-- lève toujours « Limite de 3 compositions atteinte » (test intégralement
-- annulé, zéro ligne laissée derrière).
--
-- On révoque à la fois aux rôles nominatifs ET à PUBLIC : selon la fonction, le
-- droit vient de l'un ou de l'autre (cf. 0112, où viser la mauvaise source a
-- laissé une fonction ouverte en réussissant en silence).
-- -----------------------------------------------------------------------------

revoke execute on function public.enforce_name_change_limit() from anon, authenticated, public;
revoke execute on function public.enforce_team_preset_limit() from anon, authenticated, public;
revoke execute on function public.set_chat_sender_name() from anon, authenticated, public;
