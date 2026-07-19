/**
 * Config du companion. La clé `anon` est PUBLIQUE par conception (c'est celle
 * embarquée dans le site) : la sécurité vient de la RLS côté Supabase, pas du
 * secret de la clé.
 *
 * Les constantes de jeu sont DUPLIQUÉES depuis shared/progression/ (l'extension
 * n'a pas de bundler, elle ne peut pas importer le TS du jeu). Si elles changent
 * côté jeu, les répercuter ici :
 *  - SECONDS_PER_FIGHT / OFFLINE_FIGHT_CAP  → shared/progression/deployment.ts
 *  - DUNGEON_COOLDOWN_HOURS_BY_TIER         → shared/progression/dungeon.ts
 */
export const SUPABASE_URL = 'https://vbfguqzfhedcuaygzhez.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZiZmd1cXpmaGVkY3VheWd6aGV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MTA3NTYsImV4cCI6MjA5ODQ4Njc1Nn0.eBQH_QX7NNWZ3GvFekN4iuEAsiVWQMS5CFOZL2GterQ';

export const SECONDS_PER_FIGHT = 20;
export const OFFLINE_FIGHT_CAP = 400;
export const DUNGEON_COOLDOWN_HOURS_BY_TIER = { 1: 8, 2: 10, 3: 13, 4: 15, 5: 17, 6: 19, 7: 22, 8: 24 };

export function dungeonCooldownSeconds(tier) {
  const t = Math.max(1, Math.round(tier));
  const hours = DUNGEON_COOLDOWN_HOURS_BY_TIER[t] ?? 24 + (t - 8) * 2;
  return hours * 3600;
}
