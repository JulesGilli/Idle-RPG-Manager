-- Réinitialisation de l'arbre de compétence d'un héros contre de l'or.
-- Rembourse tous les points dépensés (skills → {}, skill_points += dépensés) et
-- débite l'or (50 par point dépensé — constante dupliquée dans skills.ts:RESET_GOLD_PER_POINT).
-- SECURITY DEFINER : heroes/profiles sont SELECT-only pour le client.

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
    set skills = '{}'::jsonb, skill_points = skill_points + v_spent
    where id = p_hero_id and owner_id = v_uid;
end;
$$;

revoke execute on function public.reset_hero_skills(uuid) from public, anon;
grant  execute on function public.reset_hero_skills(uuid) to authenticated;
