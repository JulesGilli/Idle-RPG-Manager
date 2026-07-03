-- 0030_item_sets.sql
-- Sets d'ensemble : un objet peut appartenir à un set (débouché des matériaux
-- d'expédition). Les définitions de sets + recettes de pièces vivent dans
-- shared/progression/sets.ts (comme la forge) ; ici on ne stocke que l'appartenance.
alter table public.items
  add column if not exists set_id text;
