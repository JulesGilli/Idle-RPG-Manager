-- Incrément ATOMIQUE des compteurs d'emprunt de garnison.
--
-- Bug : dungeon_runs et map_fights vivent sur la MÊME ligne de
-- garrison_borrow_usage, et deux fonctions distinctes (carte & donjon) l'écrivaient
-- en read-modify-write en réécrivant LES DEUX colonnes. Entrelacées, l'une
-- écrasait l'incrément de l'autre (lost update) → un compteur revenait à 0 → le
-- cap (5 combats carte / 1 donjon par jour) sautait → héros emprunté utilisable
-- à l'infini.
--
-- Cette fonction fait un upsert-incrément atomique par colonne : chaque appel
-- n'ajoute qu'à la colonne concernée, en une seule requête verrouillée. Aucun
-- read-modify-write, donc plus aucun écrasement entre carte et donjon.
create or replace function public.increment_borrow_usage(
  p_borrower uuid,
  p_hero uuid,
  p_date text,
  p_dungeon integer default 0,
  p_map integer default 0
) returns void
language sql
as $$
  insert into public.garrison_borrow_usage
    (borrower_player_id, hero_id, usage_date, dungeon_runs, map_fights)
  values (p_borrower, p_hero, p_date, p_dungeon, p_map)
  on conflict (borrower_player_id, hero_id, usage_date)
  do update set
    dungeon_runs = garrison_borrow_usage.dungeon_runs + excluded.dungeon_runs,
    map_fights   = garrison_borrow_usage.map_fights   + excluded.map_fights;
$$;

-- Seul le service_role (Edge Functions) doit pouvoir l'appeler : sinon un joueur
-- pourrait gonfler le compteur d'un AUTRE joueur (grief) via son uuid.
revoke all on function public.increment_borrow_usage(uuid, uuid, text, integer, integer)
  from public, anon, authenticated;
