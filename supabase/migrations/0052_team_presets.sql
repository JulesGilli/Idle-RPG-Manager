-- 0052_team_presets.sql
-- Compositions d'équipe enregistrées : le joueur nomme jusqu'à 3 compos (liste
-- d'ids de héros) pour re-déployer vite en activité. Donnée de confort, sans
-- enjeu anti-triche → écriture directe du client sous RLS « propriétaire ».

create table public.team_presets (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  name       text not null,
  hero_ids   uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create index team_presets_owner_idx on public.team_presets (owner_id, created_at);

-- Plafond de 3 compositions par joueur (contrôlé en base, pas seulement à l'UI).
create or replace function public.enforce_team_preset_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.team_presets where owner_id = new.owner_id) >= 3 then
    raise exception 'Limite de 3 compositions atteinte';
  end if;
  return new;
end;
$$;

create trigger team_preset_limit
  before insert on public.team_presets
  for each row execute function public.enforce_team_preset_limit();

-- -----------------------------------------------------------------------------
-- RLS : le joueur gère uniquement ses propres compositions (CRUD complet).
-- -----------------------------------------------------------------------------
alter table public.team_presets enable row level security;

create policy "team_presets select own" on public.team_presets
  for select to authenticated using (owner_id = (select auth.uid()));

create policy "team_presets insert own" on public.team_presets
  for insert to authenticated with check (owner_id = (select auth.uid()));

create policy "team_presets update own" on public.team_presets
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "team_presets delete own" on public.team_presets
  for delete to authenticated using (owner_id = (select auth.uid()));
