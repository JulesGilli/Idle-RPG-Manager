-- 0047_guild_garrison.sql
-- Garnison de guilde : un membre dépose UN héros (snapshot figé, lecture seule)
-- que les AUTRES membres de sa guilde peuvent emprunter pour la Carte
-- (déploiement/farm) et les Donjons UNIQUEMENT. Le héros du propriétaire n'est
-- jamais bloqué ni modifié — le snapshot est une copie, même modèle que
-- hero_loans. Toute écriture passe par le service_role (garrison-actions).

create table public.guild_garrison (
  id              uuid primary key default gen_random_uuid(),
  guild_id        uuid not null references public.guilds (id) on delete cascade,
  owner_player_id uuid not null references public.profiles (id) on delete cascade,
  hero_id         uuid not null references public.heroes (id) on delete cascade,
  -- Snapshot = un CombatantInput figé au dépôt (mêmes règles que le build normal).
  hero_snapshot   jsonb not null,
  -- Champs d'affichage dénormalisés (les emprunteurs n'ont pas accès à heroes).
  hero_name       text not null,
  hero_class_id   text not null,
  hero_level      int  not null,
  created_at      timestamptz not null default now(),
  unique (owner_player_id), -- 1 seul héros déposé par membre
  unique (hero_id)          -- un héros donné n'occupe qu'une garnison
);

create index guild_garrison_guild_id_idx on public.guild_garrison (guild_id);

alter table public.guild_garrison enable row level security;

-- Lisible par les membres de la guilde (voir la garnison partagée).
-- Écriture réservée au service_role (aucune policy insert/update/delete).
create policy "guild_garrison members" on public.guild_garrison
  for select to authenticated using (public.is_guild_member(guild_id));
