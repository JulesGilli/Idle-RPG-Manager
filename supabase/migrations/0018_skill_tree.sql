-- =============================================================================
-- Arbre de compétence par classe (Bibliothèque du Savoir).
-- Chaque niveau gagné octroie 1 point de compétence (au lieu de 3 points de stat).
-- Les stats montent désormais automatiquement (croissance +5 %/niveau) ; l'ancienne
-- allocation manuelle (stat_points / alloc_*) est conservée mais gelée (grandfather).
-- Attribution/dépense côté serveur uniquement (Edge Functions, anti-triche).
-- =============================================================================

alter table public.heroes
  add column skill_points int   not null default 0  check (skill_points >= 0),
  add column skills       jsonb not null default '{}'::jsonb;

-- Rétroactif : créditer un point de compétence par niveau déjà acquis (au-delà de 1).
update public.heroes set skill_points = greatest(level - 1, 0) where level > 1;

-- Note : la vue `leaderboard` n'intègre pas encore les bonus de compétence
-- (classement masqué côté UI pour l'instant) — à mettre à jour si on le réactive.
