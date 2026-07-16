-- Le PREMIER combat du jeu : 2 Gobelins → 1 Loup solitaire.
--
-- Mesuré avec le vrai moteur (resolveCombat + scaleMapMonster + rampe + arc),
-- pour le héros de départ nu (Garde, guerrier niv.1 : 520 PV, 10 ATK, 12 DEF) :
--
--   AVANT  2 Gobelins (44 PV base → 264 en jeu ×6) : gagné à 100 %… en 95 TOURS.
--   APRÈS  1 Loup     (14 PV base →  84 en jeu ×6) : gagné à 100 % en 11 tours.
--
-- Le joueur ne PERDAIT pas ce niveau — il le gagnait au bout d'un supplice de 95
-- tours, et le tutoriel lui demande justement de regarder son premier combat « se
-- dérouler tour par tour ». C'était ça, le vrai problème : le rythme, pas la
-- difficulté. Le mur réel de la zone 1 est au niveau 3 (2 Ogres à 570 PV : le
-- combat tape le plafond de 150 tours du moteur, et atteindre le plafond = DÉFAITE).
--
-- ⚠️ Les PV d'un mob de carte sont multipliés par 6 avant le combat
-- (MAP_MONSTER_SCALING, shared/combat/difficulty.ts) et `armor` s'AJOUTE à la
-- mitigation (`def + armor`). Toute retouche de ces chiffres doit être mesurée
-- avec le moteur, pas estimée : l'écart entre la valeur écrite ici et la valeur
-- ressentie en jeu est d'un facteur 6.
--
-- Un loup n'a pas d'armure : `armor` passe à 0 (le Gobelin en avait 1). Le passif
-- `weaken` est conservé, comme sur tous les autres mobs de la zone.
--
-- Perdre le 1er combat n'est PAS requis pour ouvrir le Village : `useUnlocks`
-- débloque aussi sur `account_xp > 0` ou un niveau validé. Gagner ici ne bloque
-- donc personne.
update public.levels
set enemy_config = '{"enemies":[{"name":"Loup","hp":14,"atk":5,"def":1,"armor":0,"speed":8,"abilities":[{"kind":"on_hit","chance":0.15,"status":"weaken","potency":0.15,"duration":2}]}]}'::jsonb
where id = 'forest_1';
