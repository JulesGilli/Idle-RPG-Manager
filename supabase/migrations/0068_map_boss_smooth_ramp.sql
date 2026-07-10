-- 0068_map_boss_smooth_ramp.sql
-- Adoucit la « falaise » de difficulté des boss de carte à partir de la zone 6.
-- Avant (0055) : l'ATK saute de 90 (z5) à 176 (z6) — presque le double — puis
-- rampe très fort (283/410/558/726). Les joueurs bloquent à la z6.
-- Après : rampe RÉGULIÈRE et progressive z6→z10 (accélération douce), endgame
-- toujours exigeant mais sans mur brutal. z1-5 inchangées.
--
--   ATK : 90 → 125 → 205 → 310 → 440 → 590   (avant : 90/176/283/410/558/726)
--   PV  : 1925 → 2400 → 3500 → 4900 → 6300 → 7900
--   DEF : 33 → 38 → 48 → 58 → 70 → 82

update public.levels l
set enemy_config = jsonb_set(jsonb_set(jsonb_set(
      l.enemy_config, '{enemies,0,hp}',  to_jsonb(v.hp)),
      '{enemies,0,atk}', to_jsonb(v.atk)),
      '{enemies,0,def}', to_jsonb(v.def))
from public.maps m,
  (values (6,2400,125,38),(7,3500,205,48),(8,4900,310,58),(9,6300,440,70),(10,7900,590,82))
    as v(zone, hp, atk, def)
where m.id = l.map_id and l.is_boss = true and m.sort = v.zone;
