-- Recyclage d'objet : mémorise le COÛT EN MATÉRIAUX de la fabrication pour
-- pouvoir en rembourser une part à la destruction.
--
-- Rien n'était conservé jusqu'ici : ni matériau, ni essence de boss, ni or. Le
-- remboursement d'un objet déjà en inventaire ne peut donc qu'être DÉDUIT de son
-- nom (le suffixe donne la zone du composant) ; à partir d'ici, il devient exact.
--
-- Forme : [{ "key": "rune", "qty": 4 }, …] — uniquement les matériaux de la
-- recette de craft. Ni l'or, ni les améliorations ultérieures.

alter table public.items
  add column if not exists craft_cost jsonb;

comment on column public.items.craft_cost is
  'Materiaux consommes a la fabrication (recyclage). NULL = objet anterieur ou non forge : le remboursement est alors deduit du nom.';
