-- 0141_bots_realistic_pseudos.sql
-- Bots : pseudos plus réalistes (majoritairement des PRÉNOMS, avec quelques
-- handles) pour ressembler à une vraie communauté — les précédents penchaient
-- encore trop « gamertag ». On n'utilise JAMAIS de vrais pseudos de vraies
-- personnes (usurpation d'identité / vie privée) : ce sont des noms crédibles
-- fabriqués.

with new_names(nm, ord) as (
  select * from unnest(array[
    'lucas', 'emma34', 'hugo', 'manon', 'TheoGG', 'sofiane', 'gabriel', 'kevin62',
    'lea', 'mateo', 'marine', 'enzo_', 'juju', 'DarkSoul', 'tomtom', 'camille',
    'raphael', 'sasa', 'NoLife', 'lucie', 'greg', 'yanis', 'dorian', 'MimiChat',
    'clara', 'noa', 'ines', 'xVortex', 'maelle', 'rayan'
  ]) with ordinality as t(nm, ord)
),
bots as (
  select player_id, row_number() over (order by player_id) as rn
  from public.bot_state
)
update public.profiles p
  set display_name = nn.nm
from bots b
join new_names nn on nn.ord = b.rn
where p.id = b.player_id;
