-- =============================================================================
-- V2 — Bénédiction d'arme (Arc 2). Ajoute le niveau de bénédiction d'un objet.
-- Colonne ADDITIVE (défaut 0) → sûre à appliquer en Vague 1 (invisible tant que le
-- front V2 n'est pas ouvert et que la ressource « larme_astrale » ne droppe pas).
-- La bénédiction elle-même est gatée Arc ≥ 2 côté fonction forge. Cf. docs/refonte-v2.md §7.
-- =============================================================================

alter table public.items
  add column if not exists blessing_level int not null default 0 check (blessing_level >= 0);
