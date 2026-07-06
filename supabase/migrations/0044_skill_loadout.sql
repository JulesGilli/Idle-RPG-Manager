-- Loadout de compétences : un héros peut débloquer plusieurs actifs/ultimes dans
-- son arbre, mais n'en ACTIVE qu'un de chaque. On stocke le nœud actif équipé et
-- le nœud ultime équipé (ids de nœud d'arbre, cf. shared/progression/skills.ts).
-- NULL = repli automatique sur le premier appris (résolu dans le moteur).

alter table public.heroes
  add column if not exists active_skill_id   text,
  add column if not exists ultimate_skill_id text;

-- Le reset d'arbre rembourse les points ET remet à zéro le loadout équipé
-- (les nœuds n'existent plus après remise à '{}').
create or replace function public.reset_hero_skills(p_hero_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_skills jsonb;
  v_points int;
  v_spent  int;
  v_cost   int;
  v_gold   int;
begin
  if v_uid is null then raise exception 'Non authentifié'; end if;

  select skills, skill_points into v_skills, v_points
  from public.heroes where id = p_hero_id and owner_id = v_uid;
  if not found then raise exception 'Héros non possédé'; end if;

  select coalesce(sum(value::int), 0) into v_spent
  from jsonb_each_text(coalesce(v_skills, '{}'::jsonb));

  if v_spent <= 0 then raise exception 'Aucun point à réinitialiser'; end if;

  v_cost := v_spent * 50;

  select gold into v_gold from public.profiles where id = v_uid;
  if coalesce(v_gold, 0) < v_cost then
    raise exception 'Or insuffisant (% requis)', v_cost;
  end if;

  update public.profiles set gold = gold - v_cost where id = v_uid;
  update public.heroes
    set skills = '{}'::jsonb,
        skill_points = skill_points + v_spent,
        active_skill_id = null,
        ultimate_skill_id = null
    where id = p_hero_id and owner_id = v_uid;
end;
$$;

revoke execute on function public.reset_hero_skills(uuid) from public, anon;
grant  execute on function public.reset_hero_skills(uuid) to authenticated;
