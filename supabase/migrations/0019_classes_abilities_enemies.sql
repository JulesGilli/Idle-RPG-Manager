-- =============================================================================
-- Refonte : 5 classes archétypes, reset des arbres (nouvelle structure d'abilités)
-- et ennemis enrichis (armure + attaques spéciales + ultimes de boss).
-- =============================================================================

-- 1) Nouvelles classes (base stats alignées sur recruit.test.ts).
insert into public.hero_classes (id, name, base_hp, base_atk, base_def, base_speed) values
  ('guerrier', 'Guerrier', 130, 10, 12, 6),
  ('archer',   'Archer',   75,  16, 5,  13),
  ('mage',     'Mage',     65,  18, 4,  10),
  ('paladin',  'Paladin',  140, 9,  11, 7),
  ('soigneur', 'Soigneur', 85,  7,  5,  9)
on conflict (id) do update set
  name = excluded.name, base_hp = excluded.base_hp, base_atk = excluded.base_atk,
  base_def = excluded.base_def, base_speed = excluded.base_speed;

-- 2) Remap des héros existants vers les nouveaux archétypes.
update public.heroes set class_id = 'guerrier' where class_id = 'tank';
update public.heroes set class_id = 'archer'   where class_id = 'dps';
update public.heroes set class_id = 'soigneur' where class_id = 'healer';

-- 3) Purge des anciennes classes (plus référencées).
delete from public.hero_classes where id in ('tank', 'dps', 'healer');

-- 4) Reset des arbres de compétence (structure entièrement nouvelle) + remboursement.
update public.heroes set skills = '{}'::jsonb, skill_points = greatest(level - 1, 0);

-- 5) Ennemis : armure pour tous + attaque spéciale (mobs) / ultime (boss).
--    Fait via manipulation jsonb du tableau `enemies` de chaque niveau.
update public.levels l set enemy_config = jsonb_build_object(
  'enemies',
  (
    select jsonb_agg(
      e
      || jsonb_build_object('armor', floor(l.difficulty * 1.2)::int)
      || case
           when l.is_boss then jsonb_build_object(
             'abilities', jsonb_build_array(
               jsonb_build_object(
                 'kind', 'autocast', 'everyRounds', 4,
                 'action', jsonb_build_object(
                   'type', 'aoe', 'dmgMult', 1.5,
                   'status', 'burn', 'statusChance', 1,
                   'statusPotency', 0.12, 'statusDuration', 3, 'spread', false
                 )
               )
             )
           )
           else jsonb_build_object(
             'abilities', jsonb_build_array(
               jsonb_build_object(
                 'kind', 'on_hit', 'status', 'weaken',
                 'chance', 0.15, 'potency', 0.15, 'duration', 2
               )
             )
           )
         end
    )
    from jsonb_array_elements(l.enemy_config -> 'enemies') e
  )
)
where l.enemy_config ? 'enemies';
