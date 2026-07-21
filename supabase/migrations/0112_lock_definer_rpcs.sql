-- -----------------------------------------------------------------------------
-- FAILLE : des fonctions SECURITY DEFINER d'économie étaient appelables par
-- n'importe quel client.
--
-- `revoke all ... from public` (migration 0111) ne suffit PAS sur Supabase :
-- les droits d'exécution ne viennent pas de PUBLIC mais de GRANTs nominatifs
-- posés par les default privileges sur `anon`, `authenticated` et
-- `service_role`. Révoquer PUBLIC ne touche donc à rien.
--
-- Conséquence : `add_player_gold(p_player, p_amount)` et
-- `add_player_resource(p_player, p_resource, p_amount, p_tier)` étaient
-- exposées via PostgREST (`/rest/v1/rpc/...`) à quiconque possède la clé
-- anon — qui est publique par nature, elle est dans le bundle du front. Comme
-- ces fonctions sont SECURITY DEFINER et prennent le joueur EN PARAMÈTRE,
-- elles n'ont aucune notion de `auth.uid()` : elles créditaient l'or et les
-- ressources de n'importe quel compte, sans limite.
--
-- Ces fonctions sont réservées aux Edge Functions (service_role), qui gardent
-- leur droit d'exécution. Aucun appel côté front n'existe (vérifié).
-- -----------------------------------------------------------------------------

revoke execute on function public.add_player_resource(uuid, text, int, int) from anon, authenticated;
revoke execute on function public.add_player_gold(uuid, bigint) from anon, authenticated;

-- Même exposition, même correctif : gonfler les dégâts du boss mondial ne
-- rapporte rien à l'appelant, mais permet de tuer le boss de toute la commu.
revoke execute on function public.increment_world_boss_damage(uuid, bigint) from anon, authenticated;

-- Déclenchement des raids de guilde nocturnes : appartient au planificateur,
-- pas aux clients (le spammer rejouerait les raids à volonté).
--
-- ⚠️ Celle-ci se révoque à PUBLIC et non à anon/authenticated : son ACL est
-- « =X/postgres », donc son droit vient du défaut PostgreSQL (EXECUTE à PUBLIC)
-- et non d'un GRANT nominatif comme les trois précédentes. Révoquer
-- anon/authenticated ne lui retirait RIEN — vérifié, ça n'a pas bougé.
-- Le cron tourne en `postgres` et les Edge Functions en `service_role` : tous
-- deux ont un grant nominatif, ils gardent donc leur accès.
--
-- Morale : toujours lire `proacl` AVANT de choisir la cible du revoke, et
-- contrôler `has_function_privilege` APRÈS.
revoke execute on function public.trigger_nightly_guild_raids() from public;
