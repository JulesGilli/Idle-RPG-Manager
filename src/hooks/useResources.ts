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
  // Legacy
  iron: { label: 'Fer' },
  essence: { label: 'Essence' },
};

export function resourceMeta(key: string): { label: string } {
  return RESOURCE_META[key] ?? { label: key };
}

export function useResources() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['resources', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Resources> => {
      const { data, error } = await supabase
        .from('player_resources')
        .select('resource, amount')
        .eq('player_id', userId!);
      if (error) throw error;
      const out: Resources = {};
      for (const r of data ?? []) out[r.resource] = r.amount;
      return out;
    },
  });
}
