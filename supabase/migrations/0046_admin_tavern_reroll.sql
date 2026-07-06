-- Reroll de taverne : la seed du pool dépend désormais d'un epoch GLOBAL
-- (app_config.tavern_epoch → reroll de tous les joueurs) et d'un nonce PAR JOUEUR
-- (tavern_state.reroll → reroll ciblé / recrue forcée par l'admin).
-- Utilisés par les Edge Functions recruit + admin-actions (seed identique).
alter table public.tavern_state add column if not exists reroll int not null default 0;

insert into public.app_config (key, value)
values ('tavern_epoch', '0')
on conflict (key) do nothing;
