import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';

// Vue `player_names` (id, display_name) — non typée dans database.types → client permissif.
const pdb = supabase as unknown as SupabaseClient;

/**
 * Résout les pseudos d'un lot de joueurs (via la vue publique `player_names`).
 * La RLS de `profiles` étant « select own », les joins renvoient le pseudo des
 * AUTRES en null ; cette vue expose uniquement (id, display_name) sans fuite.
 */
export async function namesByIds(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  const map = new Map<string, string>();
  if (uniq.length === 0) return map;
  const { data } = await pdb.from('player_names').select('id, display_name').in('id', uniq);
  for (const r of (data ?? []) as { id: string; display_name: string }[]) {
    if (r.display_name) map.set(r.id, r.display_name);
  }
  return map;
}

/**
 * Résout le TITRE équipé (succès) d'un lot de joueurs via `player_names`.
 * N'ajoute au Map que les joueurs qui ont un titre équipé (les autres = absents).
 */
export async function titlesByIds(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  const map = new Map<string, string>();
  if (uniq.length === 0) return map;
  const { data } = await pdb.from('player_names').select('id, title').in('id', uniq);
  for (const r of (data ?? []) as { id: string; title: string | null }[]) {
    if (r.title) map.set(r.id, r.title);
  }
  return map;
}
