-- handle_new_user est une fonction SECURITY DEFINER destinée UNIQUEMENT au trigger
-- on_auth_user_created. Sans ce revoke, elle serait appelable via /rest/v1/rpc par
-- les rôles anon/authenticated (flag de l'advisor sécurité Supabase).
-- Révoquer EXECUTE ne casse pas le trigger : celui-ci s'exécute dans le contexte
-- du propriétaire de la table, indépendamment des droits EXECUTE du rôle appelant.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
