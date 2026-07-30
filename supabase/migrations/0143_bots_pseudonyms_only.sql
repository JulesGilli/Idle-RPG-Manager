-- 0143_bots_pseudonyms_only.sql
-- Bots : QUE des pseudonymes (handles de joueur), plus aucun vrai prénom — un
-- prénom (lucas, emma…) trahissait trop le bot. On désactive le temps du rename
-- le trigger `trg_enforce_name_change_limit` (limite à 2 changements/joueur, que
-- nos renommages successifs avaient atteinte) et on remet name_changes à 0.

alter table public.profiles disable trigger trg_enforce_name_change_limit;

with new_names(nm, ord) as (
  select * from unnest(array[
    'xShadowz', 'DarkSoul', 'NoLife', 'Vortex', 'Krkr', 'Snipz', 'BlazeIt', 'Nyxo',
    'Reaper92', 'Frosty', 'ShadowFox', 'Zephyrr', 'Nitro', 'Blitzz', 'Voxx', 'Onyx77',
    'Dragz', 'Novaz', 'Ghosty', 'Kobra', 'Turbo', 'Havok', 'Riftz', 'Zenko',
    'PxL', 'Toxik', 'Grimz', 'Slyzz', 'Wraith', 'Kaze'
  ]) with ordinality as t(nm, ord)
),
bots as (
  select player_id, row_number() over (order by player_id) as rn
  from public.bot_state
)
update public.profiles p
  set display_name = nn.nm, name_changes = 0
from bots b
join new_names nn on nn.ord = b.rn
where p.id = b.player_id;

alter table public.profiles enable trigger trg_enforce_name_change_limit;
