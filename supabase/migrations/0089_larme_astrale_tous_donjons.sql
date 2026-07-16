-- La larme astrale tombe sur les QUATRE donjons, dosée par tier.
--
-- 0088 l'avait mise sur le seul boss du T4, à 35 % : ~1 larme tous les 3 jours.
-- Trop peu. Un joueur qui veut bénir les armes de ses 9 héros — et il en essaiera
-- plus, en repassant d'une arme basique à une arme de set : ~18 armes — plus les
-- éveiller (3 larmes chacun), y passait des MOIS. Un objectif d'endgame ne doit
-- pas être un mur.
--
-- Barème : T1 0-1, T2 1-2, T3 2-3, T4 3-4, drop garanti (chance 1). Le tier
-- reste le levier — le T4 rapporte ~7× le T1 — mais chaque donjon nourrit la
-- réserve, et le T1 (cooldown 8 h) fait déjà tourner le robinet.
--
-- `min: 0` est volontaire au T1 : `rollLootInto` ignore une quantité nulle
-- (`if (qty > 0)`), donc c'est bien « une fois sur deux » et non « 0 larme »
-- affiché.
--
-- Rythme obtenu, un run de chaque par jour : 0,5 + 1,5 + 2,5 + 3,5 = 8 larmes/j.
-- Une arme bénie +10 (25 larmes, cf. blessingCost) ≈ 3 jours. Les 5 armes d'une
-- escouade ≈ 2 semaines. Reste un chantier, plus un mur.
update public.dungeon_types d
set loot_table_boss = (
      -- On purge l'entrée existante avant de la reposer : la migration reste
      -- rejouable et 0088 (35 % au T4) est proprement remplacée.
      select coalesce(jsonb_agg(e), '[]'::jsonb)
      from jsonb_array_elements(d.loot_table_boss) e
      where e->>'resource' <> 'larme_astrale'
    )
    || jsonb_build_array(
      jsonb_build_object('resource', 'larme_astrale', 'min', v.lo, 'max', v.hi, 'chance', 1)
    )
from (values
  ('dj_catacombes', 0, 1),
  ('dj_necropole', 1, 2),
  ('dj_forteresse', 2, 3),
  ('dj_abysse', 3, 4)
) as v(id, lo, hi)
where d.id = v.id;
