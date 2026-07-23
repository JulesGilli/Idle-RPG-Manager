import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

/**
 * LIEN DE SOUTIEN, piloté par `app_config` (RPC `donate_info`).
 *
 * Aucun paiement ne passe par le jeu : le bouton ouvre une page externe. Rien
 * n'est stocké sur le joueur, rien n'est promis en échange — c'est un don, pas
 * un achat.
 *
 * Tant qu'aucune URL n'est configurée en base, `url` vaut `null` et le bouton
 * ne s'affiche nulle part. Retirer le lien = vider la clé, sans redéploiement.
 */
export type DonateInfo = { url: string | null; label: string };

/** Libellé par défaut si `donate_label` n'est pas renseigné. */
export const DONATE_DEFAULT_LABEL = 'Soutenir le jeu';

/**
 * N'accepte qu'une URL **https**.
 *
 * L'URL vient de la base et finit dans un `href` : un `javascript:` y serait
 * exécuté par le navigateur. Seul un admin peut écrire `app_config`, donc le
 * risque est faible — mais une valeur mal collée ne doit pas pouvoir devenir du
 * code, et `http://` enverrait les joueurs sur une page de paiement en clair.
 */
export function safeDonateUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    return new URL(raw.trim()).protocol === 'https:' ? raw.trim() : null;
  } catch {
    return null;
  }
}

export function useDonate() {
  return useQuery({
    queryKey: ['donate_info'],
    // Le lien ne bouge quasiment jamais : inutile de le redemander à chaque écran.
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<DonateInfo> => {
      const { data, error } = await supabase.rpc('donate_info');
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return {
        url: safeDonateUrl(row?.url ?? null),
        label: (row?.label ?? '').trim() || DONATE_DEFAULT_LABEL,
      };
    },
  });
}
