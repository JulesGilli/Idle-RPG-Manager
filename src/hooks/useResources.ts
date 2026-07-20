import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';

export type Resources = Record<string, number>;

export const RESOURCE_META: Record<string, { label: string }> = {
  // Matériaux de zone
  ecorce: { label: 'Écorce' },
  cristal: { label: 'Cristal' },
  sable_noir: { label: 'Sable noir' },
  spore: { label: 'Spore' },
  obsidienne: { label: 'Obsidienne' },
  rune: { label: 'Rune' },
  nacre_noire: { label: 'Nacre noire' },
  plume_orage: { label: "Plume d'orage" },
  ombre_pure: { label: 'Ombre pure' },
  poussiere_etoile: { label: "Poussière d'étoile" },
  // Composants de boss
  coeur_sylve: { label: 'Cœur sylvestre' },
  givre_pur: { label: 'Givre pur' },
  oeil_sphinx: { label: 'Œil de sphinx' },
  coeur_hydre: { label: "Cœur d'hydre" },
  braise_eternelle: { label: 'Braise éternelle' },
  fragment_titan: { label: 'Fragment de titan' },
  encre_kraken: { label: 'Encre de kraken' },
  foudre_condensee: { label: 'Foudre condensée' },
  coeur_ombre: { label: "Cœur d'ombre" },
  essence_astrale: { label: 'Essence astrale' },
  // Gemmes (drop exclusif des boss — joaillerie)
  gemme_seve: { label: 'Gemme de Sève' },
  gemme_glace: { label: 'Gemme de Glace' },
  gemme_solaire: { label: 'Gemme Solaire' },
  gemme_venin: { label: 'Gemme de Venin' },
  gemme_braise: { label: 'Gemme de Braise' },
  gemme_runique: { label: 'Gemme Runique' },
  gemme_abyssale: { label: 'Gemme Abyssale' },
  gemme_orage: { label: "Gemme d'Orage" },
  gemme_ombre: { label: "Gemme d'Ombre" },
  gemme_astrale: { label: 'Gemme Astrale' },
  // Donjons (loot dédié — futurs sets & reliques)
  ossement: { label: 'Ossements' },
  fragment_relique: { label: 'Fragment de relique' },
  sceau_catacombe: { label: 'Sceau des catacombes' },
  // Ressource ultra-rare partagée : bénédiction d'arme (Oratoire), éveil de héros
  // et craft de runes. Tombe à 35 % sur le boss du T4 et nulle part ailleurs.
  larme_astrale: { label: 'Larme astrale' },
  // Taverne : 1 garantie par donjon terminé, dépensée pour rerouler le pool de
  // recrues (1 plume, puis 2, puis 3… jusqu'au renouvellement de 22 h).
  plume_appel: { label: "Plume d'appel" },
  // Expéditions (matériaux uniques → futurs sets d'ensemble)
  seve_primordiale: { label: 'Sève primordiale' },
  ambre_vivant: { label: 'Ambre vivant' },
  coeur_sylve_ancien: { label: 'Cœur sylvestre ancien' },
  poussiere_arcane: { label: 'Poussière arcanique' },
  tablette_oubliee: { label: 'Tablette oubliée' },
  relique_noyee: { label: 'Relique noyée' },
  minerai_stellaire: { label: 'Minerai stellaire' },
  gemme_brute: { label: 'Gemme brute' },
  eclat_du_noyau: { label: 'Éclat du noyau' },
  // Matériaux d'EVENT (monnaie de la Forge Sacrée, Arc 2 — cf. eventMaterials.ts).
  // Distribués au classement hebdo des events. Libellés dupliqués depuis le socle
  // partagé : ce dictionnaire est purement front (affichage), pas la source de vérité.
  eclat_sacre: { label: 'Éclat sacré' },
  gemme_ancienne: { label: 'Gemme brute ancienne' },
  fragment_guerre: { label: 'Fragment de guerre' },
  poussiere_benie: { label: 'Poussière bénie' },
  // Legacy
  iron: { label: 'Fer' },
  essence: { label: 'Essence' },
};

export function resourceMeta(key: string): { label: string } {
  return RESOURCE_META[key] ?? { label: key };
}

/**
 * Ressources du joueur pour SON ARC COURANT uniquement (tier = current_arc). Garde
 * la signature historique `Record<string, number>` : pour un joueur arc 1 c'est
 * identique à avant (les lignes arc 1 sont estampillées tier 1).
 */
export function useResources() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['resources', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Resources> => {
      const { data: arcRow } = await supabase
        .from('player_arc')
        .select('current_arc')
        .eq('player_id', userId!)
        .maybeSingle();
      const currentArc = Math.max(1, arcRow?.current_arc ?? 1);

      const { data, error } = await supabase
        .from('player_resources')
        .select('resource, amount')
        .eq('player_id', userId!)
        .eq('tier', currentArc);
      if (error) throw error;
      const out: Resources = {};
      for (const r of data ?? []) out[r.resource] = r.amount;
      return out;
    },
  });
}

/**
 * Toutes les ressources du joueur groupées par TIER (= arc) : tier → resource →
 * montant. Consommé par le filtre de tier de l'inventaire (autre agent).
 */
export function useResourcesByTier(): Record<number, Record<string, number>> {
  const userId = useAuthStore((s) => s.user?.id);
  const query = useQuery({
    queryKey: ['resources_by_tier', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Record<number, Record<string, number>>> => {
      const { data, error } = await supabase
        .from('player_resources')
        .select('resource, amount, tier')
        .eq('player_id', userId!);
      if (error) throw error;
      const out: Record<number, Record<string, number>> = {};
      for (const r of data ?? []) {
        const tier = Math.max(1, r.tier ?? 1);
        (out[tier] ??= {})[r.resource] = r.amount;
      }
      return out;
    },
  });
  return query.data ?? {};
}
