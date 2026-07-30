-- 0139_bots_pseudos_online.sql
-- Bots : pseudos crédibles (fini les noms de fantasy) + moins de bots « en ligne ».
--
--  • Renomme les 30 bots avec des pseudos qui ressemblent à de vrais joueurs
--    (prénoms, gamertags, minuscules, chiffres…).
--  • `bots_online` : ~4-5 en ligne à la fois (au lieu de ~45 %), toujours par
--    rotation de 15 min. On prend les 4-5 plus « bas » par hash du créneau.

with new_names(nm, ord) as (
  select * from unnest(array[
    'juju', 'Nael', 'ptitloup', 'Maya', 'sofiane62', 'DarkRaven', 'lucasg', 'Nina77',
    'tryhard', 'chaton', 'Rayan', 'bibou', 'NoScope', 'matteo', 'sasu94', 'Lea',
    'Krokmou', 'Vortex', 'poulpi', 'GGwp', 'sombra', 'LeBoss', 'riri', 'zaza',
    'kev', 'Fenix', 'MimiCat', 'Zephyr', 'Naru78', 'ClemNco'
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

-- ~4-5 bots en ligne à un instant donné, tirés par hash du créneau de 15 min.
create or replace view public.bots_online
with (security_invoker = false)
as
select s.id, s.name
from (
  select p.id, p.display_name as name,
    row_number() over (
      order by md5(p.id::text || floor(extract(epoch from now()) / 900)::text)
    ) as rn
  from public.profiles p
  where p.is_bot
) s
where s.rn <= 4 + (floor(extract(epoch from now()) / 900)::bigint % 2);  -- 4 ou 5

grant select on public.bots_online to anon, authenticated;
