-- Refonte des arbres de compétence (3 branches par classe) : les anciens ids de
-- nœuds n'existent plus. On rembourse TOUS les héros — skills remis à zéro et points
-- de compétence restaurés (1 par niveau) — pour que personne ne perde de points en
-- passant au nouvel arbre. Même approche que 0019 lors du changement de classes.
update public.heroes
set skills = '{}'::jsonb,
    skill_points = greatest(level - 1, 0);
