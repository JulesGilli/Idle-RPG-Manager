-- 0035_deployment_pending_fight.sql
-- Assaut manuel en DEUX TEMPS (résoudre → confirmer). Un assaut 'advance' est
-- d'abord calculé et STOCKÉ ici sans rien appliquer ; la victoire n'est validée
-- (déblocage, XP, or, butin) qu'à la confirmation. Abandonner l'assaut =
-- enregistré perdant, aucun déblocage. Colonne nullable, aucune écriture client
-- (les deployments restent SELECT-only côté client, mutations via Edge Function).
alter table public.deployments add column if not exists pending_fight jsonb;
