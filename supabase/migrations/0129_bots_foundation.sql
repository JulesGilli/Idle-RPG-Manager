-- 0129_bots_foundation.sql
-- FAUX JOUEURS (bots) — Phase 1 : fondation + classement principal.
--
-- But : peupler le jeu de joueurs crédibles qui progressent tout seuls, pour
-- donner une impression de communauté active. PUREMENT COSMÉTIQUE — aucun impact
-- sur l'équilibrage réel (matchmaking, drops) : le flag `profiles.is_bot` permet
-- d'exclure les bots partout où il ne faut PAS d'impact.
--
-- Représentation : un bot EST une vraie ligne `profiles` (flag `is_bot`), car
-- toutes les vues de classement partent de `profiles` et les tables satellites
-- (heroes, level_progress, plus tard arena_entries…) référencent `profiles(id)`.
-- La FK `profiles.id -> auth.users(id)` impose de créer un utilisateur auth : on
-- le fait avec un `auth.users` minimal (seul `id` est requis), sans mot de passe
-- ni email livrable (`@bots.local`) — un bot ne peut donc JAMAIS se connecter.
-- Le trigger `handle_new_user` crée alors le profil + un héros de départ, qu'on
-- ajuste ensuite.
--
-- Phase 1 couvre : le classement principal (vue `leaderboard`) et les fiches
-- publiques (vue `hero_public`), alimentés par les heroes + level_progress des
-- bots. Arène/Panthéon, guildes, World Boss = phases suivantes.

alter table public.profiles add column if not exists is_bot boolean not null default false;

-- État de progression d'un bot (source de vérité ; ses heroes/level_progress en
-- dérivent via `bot_apply`).
create table if not exists public.bot_state (
  player_id      uuid primary key references public.profiles(id) on delete cascade,
  hero_level     int    not null default 1,
  levels_cleared int    not null default 0,   -- niveaux de carte franchis (0..53)
  pace           numeric not null default 1.0, -- vitesse de grind (variée par bot)
  gold           bigint not null default 500,
  account_xp     bigint not null default 0,
  updated_at     timestamptz not null default now()
);

-- Applique l'état d'un bot à ses données VISIBLES (héros, progression carte, or).
-- Idempotent : recalcule tout depuis `bot_state`. Les bots n'ont pas d'items —
-- leur puissance vient du niveau + bonus innés + points alloués (assez pour
-- paraître équipés sans fabriquer de faux objets).
create or replace function public.bot_apply(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare s public.bot_state;
begin
  select * into s from public.bot_state where player_id = p_id;
  if not found then return; end if;

  update public.heroes set
    level     = greatest(1, s.hero_level),
    bonus_atk = s.hero_level * 4,
    bonus_def = s.hero_level * 4,
    bonus_hp  = s.hero_level * 10,
    alloc_atk = s.hero_level,
    alloc_def = s.hero_level,
    alloc_hp  = s.hero_level * 2
  where owner_id = p_id;

  -- Progression carte = les `levels_cleared` niveaux les plus faciles.
  insert into public.level_progress (player_id, level_id)
  select p_id, l.id
  from public.levels l
  order by l.difficulty asc
  limit s.levels_cleared
  on conflict do nothing;

  update public.profiles
    set gold = least(s.gold, 2000000000)::int,
        account_xp = s.account_xp
  where id = p_id;
end $$;

-- Crée un bot complet. `p_name` = pseudo affiché ; `p_hero_level` pilote la
-- puissance ; `p_levels` l'avancement carte ; `p_pace` la vitesse de progression.
create or replace function public.spawn_bot(p_name text, p_hero_level int, p_levels int, p_pace numeric)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid := gen_random_uuid();
begin
  -- Utilisateur auth minimal (le trigger handle_new_user crée profil + 1 héros).
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (
    v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'bot_' || replace(v_id::text, '-', '') || '@bots.local',
    jsonb_build_object('display_name', p_name), now(), now()
  );

  update public.profiles set is_bot = true where id = v_id;

  -- Remplace le héros de départ par 5 héros de classes variées (mix par bot).
  delete from public.heroes where owner_id = v_id;
  insert into public.heroes (owner_id, class_id, name)
  select v_id, c, initcap(c)
  from (
    select (array['guerrier','mage','archer','soigneur','paladin','voleur','necromancien','inquisiteur'])
             [1 + ((floor(random() * 8)::int + g) % 8)] as c
    from generate_series(0, 4) g
  ) q;

  insert into public.bot_state (player_id, hero_level, levels_cleared, pace, gold, account_xp)
  values (v_id, p_hero_level, least(p_levels, 53), p_pace,
          500 + p_hero_level * 1000, (p_hero_level::bigint * p_hero_level) * 50);

  perform public.bot_apply(v_id);
  return v_id;
end $$;

-- Fait progresser TOUS les bots d'un cran, à des rythmes variés (aléatoire ×
-- pace) — appelée toutes les heures par pg_cron. La progression est plafonnée
-- (niveau 95, 53 niveaux de carte) pour rester crédible.
create or replace function public.advance_bots()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare b record;
begin
  for b in select player_id, pace from public.bot_state loop
    update public.bot_state set
      hero_level     = least(95, hero_level + floor(random() * 2.5 * b.pace)::int),
      levels_cleared = least(53, levels_cleared + floor(random() * 1.6 * b.pace)::int),
      gold           = gold + floor(random() * 5000 * b.pace)::bigint,
      account_xp     = account_xp + floor(random() * 3000 * b.pace)::bigint,
      updated_at     = now()
    where player_id = b.player_id;
    perform public.bot_apply(b.player_id);
  end loop;
end $$;

-- Fonctions d'administration/interne : jamais exposées aux clients.
revoke all on function public.bot_apply(uuid) from public, anon, authenticated;
revoke all on function public.spawn_bot(text, int, int, numeric) from public, anon, authenticated;
revoke all on function public.advance_bots() from public, anon, authenticated;

-- Semis initial : 15 bots aux profils variés (nom, niveau, avancement, rythme).
-- Gardé pour être rejouable sans dupliquer : ne sème que s'il n'y a aucun bot.
do $$
declare r record;
begin
  if exists (select 1 from public.profiles where is_bot) then
    return;
  end if;
  for r in select * from (values
    ('Kaelthorn', 88, 53, 1.6),
    ('Nyxaria',   82, 51, 1.3),
    ('Dravok',    76, 48, 1.1),
    ('Sylwen',    70, 44, 1.4),
    ('Ombrelame', 64, 40, 0.9),
    ('Faelis',    58, 36, 1.2),
    ('Grimbald',  52, 31, 0.8),
    ('Ysolde',    46, 27, 1.0),
    ('Torvren',   40, 22, 1.3),
    ('Aeliska',   34, 18, 0.7),
    ('Brundir',   28, 14, 1.1),
    ('Lunestra',  22, 10, 0.9),
    ('Vexis',     16,  7, 1.5),
    ('Morwenna',  11,  4, 0.8),
    ('Pyrrhos',    7,  2, 1.2)
  ) as v(n, hl, lc, pc) loop
    perform public.spawn_bot(r.n, r.hl, r.lc, r.pc);
  end loop;
end $$;

-- Progression horaire automatique.
select cron.schedule('advance-bots', '17 * * * *', $$select public.advance_bots()$$);
