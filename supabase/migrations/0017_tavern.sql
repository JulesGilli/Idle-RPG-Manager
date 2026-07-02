-- Taverne : pool quotidien de recrues. On ne persiste que les slots déjà
-- engagés dans la journée (le pool lui-même est déterministe côté serveur,
-- dérivé de (joueur, jour) — renouvelé à minuit).
create table public.tavern_state (
  player_id uuid primary key references public.profiles (id) on delete cascade,
  day       text  not null,
  claimed   int[] not null default '{}'
);

alter table public.tavern_state enable row level security;
-- Aucune policy : seule l'Edge Function (service_role) y accède.
