-- 0112_battlefield_cooldown.sql — CHAMPS DE BATAILLE : cooldown par bataille.
--
-- Remplace le quota QUOTIDIEN global (4 sorties/jour, `battlefield_runs` à
-- slots) par un COOLDOWN de 12 h PROPRE À CHAQUE bataille (comme les donjons) —
-- décision du 22 juillet. Chaque champ de bataille redevient disponible 12 h
-- après sa dernière tentative, indépendamment des 5 autres. Récompense de
-- Poussière bénie désormais FIXE (15) quelle que soit la difficulté.
--
-- Deux tables légères remplacent `battlefield_runs` (laissée en place, orpheline —
-- pas de DROP destructeur) :
--   • `battlefield_cooldowns` : dernière tentative par (joueur, bataille).
--   • `battlefield_progress` : plus haut palier vaincu (déblocage séquentiel).

-- -----------------------------------------------------------------------------
-- Dernière tentative par (joueur, bataille) — pilote le cooldown de 12 h.
-- -----------------------------------------------------------------------------
create table if not exists public.battlefield_cooldowns (
  player_id      uuid not null references public.profiles (id) on delete cascade,
  battlefield_id text not null,
  last_run_at    timestamptz not null default now(),
  primary key (player_id, battlefield_id)
);

-- -----------------------------------------------------------------------------
-- Réservation ATOMIQUE d'une tentative (anti multi-onglets, anti double-crédit) :
-- l'upsert ne met à jour `last_run_at` QUE si le cooldown est expiré. Renvoie
-- `true` si la tentative est acceptée (donc réservée), `false` sinon — le
-- combat/le crédit de butin ne doivent avoir lieu QUE si `true`.
-- -----------------------------------------------------------------------------
create or replace function public.try_start_battlefield(
  p_player           uuid,
  p_battlefield_id    text,
  p_cooldown_hours    int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows int;
begin
  insert into public.battlefield_cooldowns (player_id, battlefield_id, last_run_at)
  values (p_player, p_battlefield_id, now())
  on conflict (player_id, battlefield_id) do update
    set last_run_at = now()
    where battlefield_cooldowns.last_run_at <= now() - (p_cooldown_hours || ' hours')::interval;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;
revoke all on function public.try_start_battlefield(uuid, text, int) from public;

-- -----------------------------------------------------------------------------
-- Progression : plus haut palier VAINCU (déblocage séquentiel).
-- -----------------------------------------------------------------------------
create table if not exists public.battlefield_progress (
  player_id       uuid primary key references public.profiles (id) on delete cascade,
  highest_cleared int  not null default 0
);

create or replace function public.bump_battlefield_progress(p_player uuid, p_idx int)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.battlefield_progress (player_id, highest_cleared)
  values (p_player, greatest(0, p_idx))
  on conflict (player_id) do update
    set highest_cleared = greatest(public.battlefield_progress.highest_cleared, excluded.highest_cleared);
$$;
revoke all on function public.bump_battlefield_progress(uuid, int) from public;

-- -----------------------------------------------------------------------------
-- RLS : un joueur ne lit QUE ses propres données. Aucune écriture client :
-- seule l'Edge Function `resolve-battlefield` (service_role) écrit.
-- -----------------------------------------------------------------------------
alter table public.battlefield_cooldowns enable row level security;
alter table public.battlefield_progress  enable row level security;

create policy "battlefield_cooldowns readable by owner"
  on public.battlefield_cooldowns for select to authenticated using (player_id = auth.uid());
create policy "battlefield_progress readable by owner"
  on public.battlefield_progress for select to authenticated using (player_id = auth.uid());
