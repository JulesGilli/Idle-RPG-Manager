-- 0059_launch_redeem_codes.sql
-- Codes de récompense pour le lancement V1. Ils sont sûrs/additifs : un code ne
-- fait rien tant qu'il n'est pas réclamé, et chaque joueur ne peut le réclamer
-- qu'une fois (verrou (code, player_id) dans redeem_claims).
--
-- Rappel : les codes sont stockés NORMALISÉS (majuscules, sans espaces/tirets)
-- car la fonction redeem-code normalise l'entrée du joueur avant la recherche.
-- Format du champ `reward` : voir shared/progression/redeem.ts (RedeemReward).
--   { gold?, materials?: [{key, qty}], item?: true | {base_id, material_id, rarity} }
-- Clés de matériaux valides : voir FORGE_MATERIALS (ecorce z1, cristal z2,
-- sable_noir z3, …). base_id : FORGE_BASES (grande_epee, epee, arc, tunique…).
-- rarity : poor | common | uncommon | advanced | ultimate.

insert into public.redeem_codes (code, reward, max_uses, active) values
  -- Cadeau de bienvenue / boost de départ : de quoi forger 1 arme de zone 1
  -- (craft chêne = 120 or + 10 écorce), avec un peu de marge.
  (
    'BIENVENUE',
    '{"gold":500,"materials":[{"key":"ecorce","qty":12}]}'::jsonb,
    null,
    true
  ),
  -- Petit bonus de lancement (or + matériaux, sans objet).
  (
    'LANCEMENTV1',
    '{"gold":1500,
      "materials":[{"key":"ecorce","qty":40},{"key":"cristal","qty":25},{"key":"sable_noir","qty":15}]}'::jsonb,
    null,
    true
  ),
  -- Clin d'œil aux potes.
  (
    'MERCILESPOTES',
    '{"gold":800,"materials":[{"key":"cristal","qty":20}]}'::jsonb,
    null,
    true
  )
on conflict (code) do update
  set reward   = excluded.reward,
      max_uses = excluded.max_uses,
      active   = excluded.active;

-- Ancien code de test « WELCOME » (item ultimate zone 1) : trop fort pour le
-- lancement → désactivé. No-op si le code n'existe pas dans cette base.
update public.redeem_codes set active = false where code = 'WELCOME';
