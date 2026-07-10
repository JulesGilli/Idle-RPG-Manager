/**
 * Sortie programmée — helper PUR (partagé front + Edge Functions).
 *
 * Les edge functions qui gèrent une feature V1.x liront `release_at` dans
 * app_config (via l'admin client) puis appelleront `isReleased(release_at, Date.now())`
 * — Date.now() côté Deno = HORLOGE SERVEUR — pour refuser le nouveau comportement
 * (récompenses) avant l'heure. Verrou anti-triche, comme les cooldowns.
 */

/** La sortie datée `releaseAtIso` est-elle atteinte à l'instant `nowMs` ? */
export function isReleased(releaseAtIso: string | null | undefined, nowMs: number): boolean {
  if (!releaseAtIso) return true; // rien de programmé → tout est actif
  const t = Date.parse(releaseAtIso);
  if (Number.isNaN(t)) return true; // valeur illisible → on ne bloque pas
  return nowMs >= t;
}
