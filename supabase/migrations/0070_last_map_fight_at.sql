-- 0070_last_map_fight_at.sql
-- Ancre le cooldown d'assaut MANUEL (mode 'advance') au NIVEAU DU JOUEUR, pas de
-- la ligne de déploiement. Permet un premier combat immédiat après avoir posé une
-- équipe (l'ancien comportement imposait 20 s d'attente avant le 1er combat) TOUT
-- en restant inviolable : le timestamp survit au redeploy/undeploy/toggle, donc on
-- ne peut pas obtenir plus d'un combat par cooldown en recréant le déploiement.
alter table public.profiles
  add column if not exists last_map_fight_at timestamptz;
