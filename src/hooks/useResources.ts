import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';

export type Resources = Record<string, number>;

export const RESOURCE_META: Record<string, { label: string; icon: string }> = {
  // Matériaux de zone
  ecorce: { label: 'Écorce', icon: '🪵' },
  cristal: { label: 'Cristal', icon: '💎' },
  sable_noir: { label: 'Sable noir', icon: '⏳' },
  spore: { label: 'Spore', icon: '🍄' },
  obsidienne: { label: 'Obsidienne', icon: '🪨' },
  rune: { label: 'Rune', icon: '📜' },
  nacre_noire: { label: 'Nacre noire', icon: '🦪' },
  plume_orage: { label: "Plume d'orage", icon: '🪶' },
  ombre_pure: { label: 'Ombre pure', icon: '🌑' },
  poussiere_etoile: { label: "Poussière d'étoile", icon: '✨' },
  // Composants de boss
  coeur_sylve: { label: 'Cœur sylvestre', icon: '🌳' },
  givre_pur: { label: 'Givre pur', icon: '❄️' },
  oeil_sphinx: { label: 'Œil de sphinx', icon: '👁️' },
  coeur_hydre: { label: "Cœur d'hydre", icon: '🐍' },
  braise_eternelle: { label: 'Braise éternelle', icon: '🔥' },
  fragment_titan: { label: 'Fragment de titan', icon: '🗿' },
  encre_kraken: { label: 'Encre de kraken', icon: '🐙' },
  foudre_condensee: { label: 'Foudre condensée', icon: '⚡' },
  coeur_ombre: { label: "Cœur d'ombre", icon: '🖤' },
  essence_astrale: { label: 'Essence astrale', icon: '🌟' },
  // Gemmes (drop exclusif des boss — joaillerie)
  gemme_seve: { label: 'Gemme de Sève', icon: '🟢' },
  gemme_glace: { label: 'Gemme de Glace', icon: '🔷' },
  gemme_solaire: { label: 'Gemme Solaire', icon: '🟡' },
  gemme_venin: { label: 'Gemme de Venin', icon: '🧪' },
  gemme_braise: { label: 'Gemme de Braise', icon: '🔴' },
  gemme_runique: { label: 'Gemme Runique', icon: '🟣' },
  gemme_abyssale: { label: 'Gemme Abyssale', icon: '🔵' },
  gemme_orage: { label: "Gemme d'Orage", icon: '⚡' },
  gemme_ombre: { label: "Gemme d'Ombre", icon: '⚫' },
  gemme_astrale: { label: 'Gemme Astrale', icon: '💠' },
  // Donjons (loot dédié — futurs sets & reliques)
  ossement: { label: 'Ossements', icon: '🦴' },
  fragment_relique: { label: 'Fragment de relique', icon: '🏺' },
  sceau_catacombe: { label: 'Sceau des catacombes', icon: '🗝️' },
  // Legacy
  iron: { label: 'Fer', icon: '⛏️' },
  essence: { label: 'Essence', icon: '🔷' },
};

export function resourceMeta(key: string): { label: string; icon: string } {
  return RESOURCE_META[key] ?? { label: key, icon: '📦' };
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
