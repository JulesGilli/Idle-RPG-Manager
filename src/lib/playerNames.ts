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

/** Titre équipé d'un joueur + son multiplicateur de stat s'il en accorde. */
export type PlayerTitle = {
  title: string;
  /** 1.05 = +5 % ATK. `null` pour un titre de succès (purement honorifique). */
  statMult: number | null;
};

/**
 * Résout le TITRE équipé d'un lot de joueurs via `player_names`.
 * N'ajoute au Map que les joueurs qui ont un titre équipé (les autres = absents).
 *
 * `title_stat_mult` distingue les TITRES DE GLOIRE (événement, ils accordent des
 * stats et expirent) des titres de succès : la vue ne le renseigne que si le
 * titre est encore valide, donc un titre expiré retombe naturellement en
 * honorifique — c'est ce qui permet de les colorer différemment sans mentir.
 */
export async function titlesByIds(
  ids: (string | null | undefined)[],
): Promise<Map<string, PlayerTitle>> {
  const uniq = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  const map = new Map<string, PlayerTitle>();
  if (uniq.length === 0) return map;
  const { data } = await pdb.from('player_names').select('id, title, title_stat_mult').in('id', uniq);
  for (const r of (data ?? []) as { id: string; title: string | null; title_stat_mult: number | string | null }[]) {
    if (!r.title) continue;
    // `numeric` de Postgres arrive en CHAÎNE via PostgREST : sans cette
    // conversion, la comparaison « > 1 » serait faite sur du texte.
    const raw = r.title_stat_mult;
    const mult = raw == null ? null : Number(raw);
    map.set(r.id, { title: r.title, statMult: mult != null && Number.isFinite(mult) ? mult : null });
  }
  return map;
}
