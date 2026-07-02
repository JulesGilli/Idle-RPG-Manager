-- Recrutement : chaque héros porte des bonus de naissance individuels par
-- stat (peuvent être négatifs — bons et mauvais rolls). Les héros existants
-- restent neutres (0).
alter table public.heroes
  add column bonus_hp    int not null default 0,
  add column bonus_atk   int not null default 0,
  add column bonus_def   int not null default 0,
  add column bonus_speed int not null default 0;
