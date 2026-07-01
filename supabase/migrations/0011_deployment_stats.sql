-- Suivi de l'activité de farm par déploiement (dernière session + blocage + clears).
alter table public.deployments
  add column last_wins    int     not null default 0,
  add column last_losses  int     not null default 0,
  add column last_fights  int     not null default 0,
  add column blocked      boolean not null default false,
  add column clears_count int     not null default 0;
