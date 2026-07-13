-- =============================================================================
-- 0077_profile_title.sql
-- V2 — Titre équipé du joueur (débloqué par un succès). Un seul à la fois.
-- Colonne ADDITIVE nullable → sûre en Vague 1. Le titre est validé côté serveur
-- (edge function titles) : on ne peut équiper qu'un titre réellement débloqué.
-- =============================================================================

alter table public.profiles
  add column if not exists title text;
