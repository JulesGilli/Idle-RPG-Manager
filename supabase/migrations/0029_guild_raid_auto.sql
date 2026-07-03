-- 0029_guild_raid_auto.sql
-- Raid de guilde AUTOMATIQUE tous les soirs à 20h (Europe/Paris).
--  - Inscription persistante : chaque membre engage jusqu'à 2 héros, INDÉPENDAMMENT
--    de leur disponibilité (un héros peut être déployé/en expédition ET inscrit).
--  - À 20h Paris, un cron (pg_cron) appelle l'Edge Function guild-raid (action
--    'run_auto', protégée par un secret) qui résout le raid de chaque guilde avec
--    les héros inscrits (stats live au moment de la résolution).

-- -----------------------------------------------------------------------------
-- Inscription au raid (1 ligne par joueur, max 2 héros)
-- -----------------------------------------------------------------------------
create table if not exists public.guild_raid_enrollments (
  player_id   uuid primary key references public.profiles (id) on delete cascade,
  guild_id    uuid not null references public.guilds (id) on delete cascade,
  hero_ids    uuid[] not null default '{}'
                check (coalesce(array_length(hero_ids, 1), 0) <= 2),
  updated_at  timestamptz not null default now()
);
create index if not exists guild_raid_enrollments_guild_idx
  on public.guild_raid_enrollments (guild_id);

alter table public.guild_raid_enrollments enable row level security;
-- Les membres voient les inscriptions de leur guilde (helper security-definer existant).
-- AUCUNE policy d'écriture → seules les Edge Functions (service_role) écrivent.
drop policy if exists "raid_enrollments members" on public.guild_raid_enrollments;
create policy "raid_enrollments members"
  on public.guild_raid_enrollments for select to authenticated
  using (public.is_guild_member(guild_id));

-- -----------------------------------------------------------------------------
-- Secret partagé cron → Edge Function (table lisible service_role uniquement)
-- -----------------------------------------------------------------------------
create table if not exists public.app_config (
  key   text primary key,
  value text not null
);
alter table public.app_config enable row level security; -- aucune policy = client aveugle
insert into public.app_config (key, value)
values (
  'raid_cron_secret',
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
)
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- Cron : pg_cron + pg_net. Appel HORAIRE d'une fonction qui ne déclenche le raid
-- que lorsqu'il est 20h à Paris (gère l'heure d'été/hiver via `at time zone`).
-- -----------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.trigger_nightly_guild_raids()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  secret text;
begin
  -- Ne rien faire hors de la fenêtre 20h (heure de Paris).
  if extract(hour from (now() at time zone 'Europe/Paris')) <> 20 then
    return;
  end if;
  select value into secret from public.app_config where key = 'raid_cron_secret';
  perform net.http_post(
    url     := 'https://vbfguqzfhedcuaygzhez.supabase.co/functions/v1/guild-raid',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-raid-secret', secret),
    body    := jsonb_build_object('action', 'run_auto')
  );
end;
$$;

-- Remplace un éventuel job existant du même nom, puis (re)programme l'horaire.
select cron.unschedule('nightly-guild-raids')
where exists (select 1 from cron.job where jobname = 'nightly-guild-raids');

select cron.schedule(
  'nightly-guild-raids',
  '0 * * * *',                                   -- chaque heure pile
  $$ select public.trigger_nightly_guild_raids(); $$
);
