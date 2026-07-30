-- 0138_guest_accounts.sql
-- COMPTE INVITÉ (auth anonyme) : jouer sans inscription, puis convertir en
-- compte permanent en gardant toute la progression (même user id → rien à migrer).
--
-- ⚠️ L'auth anonyme doit être ACTIVÉE dans le dashboard Supabase
-- (Authentication → Sign In / Providers → Allow anonymous sign-ins). Non
-- configurable ici (réglage GoTrue, pas SQL).
--
-- Garde-fous anti-flood :
--   1. flag `profiles.is_guest` (posé par `handle_new_user` si le compte est
--      anonyme) → les invités sont EXCLUS du classement tant qu'ils n'ont pas
--      converti ;
--   2. `claim_guest_account()` bascule is_guest=false à la conversion ;
--   3. cron qui supprime les invités qui n'ont JAMAIS rien joué (0 level_progress)
--      et datent de plus de 3 jours (suppression auth.users → cascade).

alter table public.profiles add column if not exists is_guest boolean not null default false;

-- Le trigger de création de profil : un compte anonyme devient un invité.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  new_name text;
  guest boolean := coalesce(new.is_anonymous, false);
begin
  new_name := case
    when guest then 'Invité'
    else coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(split_part(new.email, '@', 1), ''),
      'Commandant'
    )
  end;

  insert into public.profiles (id, display_name, gold, is_guest)
  values (new.id, new_name, 500, guest);

  insert into public.heroes (owner_id, class_id, name)
  values (new.id, 'guerrier', 'Garde');

  return new;
end;
$function$;

-- Conversion invité → permanent : le front appelle ce RPC après updateUser().
-- SECURITY DEFINER, agit uniquement sur le profil de l'appelant.
create or replace function public.claim_guest_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set is_guest = false where id = auth.uid();
end $$;

revoke all on function public.claim_guest_account() from public, anon;
grant execute on function public.claim_guest_account() to authenticated;

-- Classement principal : exclut les invités (ajout d'un WHERE, colonnes
-- inchangées → create or replace sans toucher aux vues dépendantes).
create or replace view public.leaderboard
with (security_invoker = false)
as
 WITH hero_stats AS (
         SELECT h.owner_id, h.level, h.alloc_hp, h.alloc_atk, h.alloc_def, h.alloc_speed,
            hc.base_hp, hc.base_atk, hc.base_def, hc.base_speed,
            COALESCE(w.atk_bonus, 0) + COALESCE(a.atk_bonus, 0) + COALESCE(j.atk_bonus, 0) + COALESCE(r.atk_bonus, 0) AS atk_bonus,
            COALESCE(w.def_bonus, 0) + COALESCE(a.def_bonus, 0) + COALESCE(j.def_bonus, 0) + COALESCE(r.def_bonus, 0) AS def_bonus,
            COALESCE(w.hp_bonus, 0) + COALESCE(a.hp_bonus, 0) + COALESCE(j.hp_bonus, 0) + COALESCE(r.hp_bonus, 0) AS hp_bonus
           FROM heroes h
             JOIN hero_classes hc ON hc.id = h.class_id
             LEFT JOIN items w ON w.id = h.equipped_weapon_id
             LEFT JOIN items a ON a.id = h.equipped_armor_id
             LEFT JOIN items j ON j.id = h.equipped_jewel_id
             LEFT JOIN items r ON r.id = h.equipped_relic_id
        ), hero_power AS (
         SELECT hero_stats.owner_id,
            (round(hero_stats.base_atk::numeric * (1::numeric + 0.05 * (hero_stats.level - 1)::numeric)) + hero_stats.atk_bonus::numeric + (hero_stats.alloc_atk * 2)::numeric) * 2::numeric + (round(hero_stats.base_def::numeric * (1::numeric + 0.05 * (hero_stats.level - 1)::numeric)) + hero_stats.def_bonus::numeric + (hero_stats.alloc_def * 2)::numeric) * 2::numeric + (round(hero_stats.base_hp::numeric * (1::numeric + 0.05 * (hero_stats.level - 1)::numeric)) + hero_stats.hp_bonus::numeric + (hero_stats.alloc_hp * 8)::numeric) * 4::numeric * 0.5 + (hero_stats.base_speed + hero_stats.alloc_speed)::numeric AS power
           FROM hero_stats
        ), ranked AS (
         SELECT hero_power.owner_id, hero_power.power,
            row_number() OVER (PARTITION BY hero_power.owner_id ORDER BY hero_power.power DESC) AS rn
           FROM hero_power
        ), player_power AS (
         SELECT ranked.owner_id, sum(ranked.power)::integer AS total_power
           FROM ranked WHERE ranked.rn <= 5 GROUP BY ranked.owner_id
        ), player_levels AS (
         SELECT lp.player_id, count(*) AS levels_cleared, COALESCE(max(l.difficulty), 0) AS max_difficulty
           FROM level_progress lp JOIN levels l ON l.id = lp.level_id GROUP BY lp.player_id
        )
 SELECT p.id AS player_id, p.display_name,
    COALESCE(pp.total_power, 0) AS total_power,
    COALESCE(pl.levels_cleared, 0::bigint) AS levels_cleared,
    COALESCE(pl.max_difficulty, 0) AS max_difficulty,
    p.gold
   FROM profiles p
     LEFT JOIN player_power pp ON pp.owner_id = p.id
     LEFT JOIN player_levels pl ON pl.player_id = p.id
  WHERE p.is_guest = false;

-- Nettoyage des invités jamais engagés (0 level_progress) datant de > 3 jours.
-- Sûr : un invité qui a joué (au moins un niveau) n'est jamais supprimé ; un
-- invité converti (is_guest=false) non plus. Cascade FK → profil/héros supprimés.
create or replace function public.cleanup_stale_guests()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from auth.users u
  using public.profiles p
  where u.id = p.id
    and p.is_guest = true
    and p.created_at < now() - interval '3 days'
    and not exists (select 1 from public.level_progress lp where lp.player_id = p.id);
end $$;

revoke all on function public.cleanup_stale_guests() from public, anon, authenticated;

select cron.schedule('cleanup-stale-guests', '0 4 * * *', $$select public.cleanup_stale_guests()$$);
