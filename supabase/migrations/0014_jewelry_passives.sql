-- Joaillerie : les bijoux ne donnent plus de stats brutes mais un PASSIF en %
-- (vampirisme, épines, esquive…). Le type vient de la gemme (drop de boss),
-- la valeur du composant de zone utilisé au craft.
alter table public.items
  add column passive_type text,
  add column passive_value int not null default 0 check (passive_value >= 0);
