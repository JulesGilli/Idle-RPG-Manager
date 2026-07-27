-- 0124_resource_refinery.sql
-- La Raffinerie (Arc 2) : un puits d'or qui monte le taux de drop de la carte.
-- Un niveau par joueur ; l'upgrade est ATOMIQUE (dépense d'or + incrément) via
-- un RPC SECURITY DEFINER, pour qu'aucun double-clic / multi-onglet ne double
-- l'incrément ou dépense l'or deux fois.

create table if not exists public.resource_refinery (
  player_id  uuid primary key references public.profiles (id) on delete cascade,
  level      int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.resource_refinery enable row level security;

-- Lecture de sa propre ligne (l'écran affiche le niveau/bonus). Écriture réservée
-- au service_role (les fonctions Edge), jamais directement par le client.
drop policy if exists resource_refinery_select_own on public.resource_refinery;
create policy resource_refinery_select_own on public.resource_refinery
  for select using (auth.uid() = player_id);

-- Upgrade atomique. `p_from_level` = niveau que l'appelant CROIT courant :
-- compare-and-swap contre la valeur en base (une montée concurrente le fait
-- diverger → -1, aucun double-crédit). `p_cost` calculé serveur (edge) puis
-- vérifié contre l'or sous verrou. Retours : nouveau niveau, ou -1 (niveau
-- périmé), -2 (or insuffisant).
create or replace function public.upgrade_resource_refinery(
  p_player uuid,
  p_cost bigint,
  p_from_level int
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_level int;
  v_gold bigint;
begin
  insert into public.resource_refinery (player_id, level)
  values (p_player, 0)
  on conflict (player_id) do nothing;

  -- Verrou de la ligne du bâtiment : sérialise les upgrades concurrents.
  select level into v_level from public.resource_refinery
    where player_id = p_player for update;
  if v_level is distinct from p_from_level then
    return -1; -- niveau périmé (une autre upgrade est déjà passée)
  end if;

  select gold into v_gold from public.profiles where id = p_player for update;
  if v_gold is null or v_gold < p_cost then
    return -2; -- or insuffisant
  end if;

  update public.profiles set gold = gold - p_cost where id = p_player;
  update public.resource_refinery
    set level = p_from_level + 1, updated_at = now()
    where player_id = p_player;
  return p_from_level + 1;
end;
$$;

-- Réservée aux fonctions Edge (service_role). Pas exposée au client : un joueur
-- pourrait sinon s'appeler l'upgrade avec le coût qu'il veut.
revoke all on function public.upgrade_resource_refinery(uuid, bigint, int) from public, anon, authenticated;
grant execute on function public.upgrade_resource_refinery(uuid, bigint, int) to service_role;
