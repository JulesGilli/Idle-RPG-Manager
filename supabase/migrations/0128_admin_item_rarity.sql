-- 0128_admin_item_rarity.sql
-- Ajoute le palier de rareté « admin » (violet) à la contrainte des objets.
-- Ce palier N'EST PAS un palier de butin : il est réservé aux objets forgés à la
-- main dans le panneau d'administration (stats libres), jamais tiré ni crafté.
-- Sans cet ajout, l'insert d'un objet admin serait rejeté par `items_rarity_check`.

alter table public.items drop constraint if exists items_rarity_check;
alter table public.items add constraint items_rarity_check
  check (rarity in ('poor', 'common', 'uncommon', 'advanced', 'ultimate', 'admin'));
