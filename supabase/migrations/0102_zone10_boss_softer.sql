-- 0102_zone10_boss_softer.sql
-- Trône Astral (zone 10) : ATK du boss final réduite de 25 % (590 → 443).
--
-- Seule l'ATK bouge : PV, DEF, armure, vitesse et l'AoE brûlure sont inchangés.
-- L'AoE (dmgMult 1.5) et le DoT suivent l'ATK, ils s'adoucissent donc dans la
-- même proportion sans qu'on ait à y toucher.
--
-- À noter : la mitigation se SOUSTRAIT avant le calcul, donc −25 % d'ATK vaut
-- plus de −25 % de dégâts encaissés. Contre un héros à 80 de mitigation, les
-- dégâts bruts passent de 510 à 363, soit −29 % ; contre un héros à 124, −32 %.
-- L'adoucissement réel est donc plus fort que le chiffre affiché.
--
-- Les niveaux sont lus en base à chaque combat : aucun redéploiement de fonction
-- n'est nécessaire, un rechargement suffit.
update public.levels
set enemy_config = jsonb_set(
  enemy_config,
  '{enemies,0,atk}',
  to_jsonb(443)
)
where id = 'celestial_5';
