-- 0055_map_boss_rebalance.sql
-- Rééquilibrage des BOSS de carte (validé par simulation du moteur réel) :
-- courbe de difficulté « qui monte ». z1-2 adoucis (onboarding), z3-5 inchangés,
-- z6-10 renforcés (rampe) pour qu'un build complet (set+gemmes+arbre) « sweat »
-- en fin de carte (PV restants ~100 % → ~40 % de la zone 6 à la zone 10).
-- Seule la stat du boss change (nom / armure / vitesse / capacité conservés).

update public.levels l
set enemy_config = jsonb_set(jsonb_set(jsonb_set(
      l.enemy_config, '{enemies,0,hp}',  to_jsonb(v.hp)),
      '{enemies,0,atk}', to_jsonb(v.atk)),
      '{enemies,0,def}', to_jsonb(v.def))
from public.maps m,
  (values (1,765,27,18),(2,1360,43,25),(3,1275,60,23),(4,1600,75,28),(5,1925,90,33),
          (6,2925,176,42),(7,4120,283,52),(8,5510,410,62),(9,7095,558,74),(10,8875,726,87))
    as v(zone, hp, atk, def)
where m.id = l.map_id and l.is_boss = true and m.sort = v.zone;
