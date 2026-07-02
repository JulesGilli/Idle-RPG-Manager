-- Raffinement des bijoux : on garde la valeur de base du passif pour
-- recalculer le % effectif à chaque niveau de raffinement (upgrade_level).
alter table public.items
  add column base_passive_value int not null default 0 check (base_passive_value >= 0);

-- Les bijoux existants deviennent leur propre base (raffinement 0).
update public.items set base_passive_value = passive_value where passive_value > 0;
