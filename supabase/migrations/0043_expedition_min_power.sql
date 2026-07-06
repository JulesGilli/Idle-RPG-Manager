-- Expéditions : seuil de PUISSANCE D'ÉQUIPE minimum pour lancer une expédition.
-- La puissance = somme des puissances des héros engagés (heroPower).
alter table public.expedition_types
  add column if not exists min_power_required int not null default 0;

update public.expedition_types set min_power_required = 1000 where id = 'exp_foret_fossile';
update public.expedition_types set min_power_required = 2500 where id = 'exp_ruines_englouties';
update public.expedition_types set min_power_required = 5000 where id = 'exp_mines_abyssales';
