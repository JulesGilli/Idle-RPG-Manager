-- 0099_tavern_reroll_feather.sql
-- Plume d'appel : nouvelle ressource, 1 garantie par donjon terminé, qui paie
-- les rerolls manuels de la Taverne (1 plume, puis 2, puis 3…).
--
-- ⚠️ À APPLIQUER APRÈS 0098 : la mise à jour du butin balaie toutes les lignes de
-- `dungeon_types`, donc les 4 donjons créés par 0098 n'auraient pas de plume si
-- cette migration passait en premier. Elle est rejouable : relancer 0099 après
-- 0098 rattrape le tir sans créer de doublon (l'entrée existante est purgée
-- avant d'être réinsérée, même pattern que 0089_larme_astrale_tous_donjons).

-- --------------------------------------------------------------- COMPTEUR
-- Le nonce `reroll` existant ne peut pas servir de compteur de coût : il est
-- aussi bumpé par l'admin (reroll offert / recrue forcée), ce qui ferait grimper
-- le prix payé par le joueur sans qu'il ait rien demandé. D'où une colonne
-- dédiée, remise à 0 au basculement de `day` (22 h Paris), comme `claimed`.
alter table public.tavern_state
  add column if not exists paid_rerolls int not null default 0;

comment on column public.tavern_state.paid_rerolls is
  'Rerolls PAYANTS depuis le dernier renouvellement naturel (22 h Paris). Pilote le prix du suivant (n+1 plumes). Remis a 0 quand `day` change. Distinct de `reroll`, qui est le nonce de seed bumpe aussi par l''admin.';

-- ------------------------------------------------------------------ BUTIN
-- 1 plume par donjon TERMINÉ : l'entrée est posée sur la table du BOSS, et le
-- butin n'est crédité que sur un combat gagné — un wipe avant le boss ne rapporte
-- donc rien. `chance: 1` et min = max = 1 : c'est un drop garanti, pas un tirage.
update public.dungeon_types
set loot_table_boss = (
  select coalesce(jsonb_agg(e), '[]'::jsonb)
  from jsonb_array_elements(loot_table_boss) as e
  where e->>'resource' is distinct from 'plume_appel'
) || '[{"resource":"plume_appel","min":1,"max":1,"chance":1}]'::jsonb;
