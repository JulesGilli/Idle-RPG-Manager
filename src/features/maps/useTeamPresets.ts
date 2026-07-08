import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';

/** Une composition d'équipe enregistrée (nom + héros), limitée à 3 par joueur. */
export type TeamPreset = {
  id: string;
  name: string;
  hero_ids: string[];
  created_at: string;
};

export const MAX_TEAM_PRESETS = 3;

/** Compositions enregistrées du joueur (RLS « select own »). */
export function useTeamPresets() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['team_presets', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<TeamPreset[]> => {
      const { data, error } = await supabase
        .from('team_presets')
        .select('id, name, hero_ids, created_at')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as TeamPreset[];
    },
  });
}

/** Mutations d'enregistrement / mise à jour / suppression d'une composition. */
export function useTeamPresetActions() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['team_presets', userId] });

  const save = useMutation({
    mutationFn: async (args: { name: string; heroIds: string[] }) => {
      if (!userId) throw new Error('Non authentifié');
      const { error } = await supabase
        .from('team_presets')
        .insert({ owner_id: userId, name: args.name, hero_ids: args.heroIds });
      // Le trigger renvoie une erreur si > 3 compositions.
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async (args: { id: string; name?: string; heroIds?: string[] }) => {
      const patch: { name?: string; hero_ids?: string[] } = {};
      if (args.name !== undefined) patch.name = args.name;
      if (args.heroIds !== undefined) patch.hero_ids = args.heroIds;
      const { error } = await supabase.from('team_presets').update(patch).eq('id', args.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('team_presets').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });

  return { save, update, remove };
}
