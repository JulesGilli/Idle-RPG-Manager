-- XP DE COMPTE ATOMIQUE.
--
-- `addAccountXp` faisait un lire-puis-écrire (`select account_xp` puis
-- `update ... = valeur + xp`) : exactement le motif qui a fait perdre son butin
-- à un joueur sur le farm de carte (corrigé alors par `add_player_gold`).
-- Deux crédits concurrents — deux onglets, ou les groupes d'un même claim
-- résolus en parallèle — et l'un des deux disparaît.
--
-- Le crédit se fait donc en UNE instruction, côté base.

create or replace function public.add_account_xp(p_player uuid, p_amount bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set account_xp = coalesce(account_xp, 0) + greatest(0, p_amount)
   where id = p_player;
$$;

-- Comme `add_player_gold` : réservée au service_role (les fonctions Edge). Un
-- joueur ne doit jamais pouvoir s'accorder de l'XP de compte, et le paramètre
-- `p_player` rendrait la fonction exploitable si elle était exposée (cf. 0112).
revoke all on function public.add_account_xp(uuid, bigint) from public, anon, authenticated;
grant execute on function public.add_account_xp(uuid, bigint) to service_role;
