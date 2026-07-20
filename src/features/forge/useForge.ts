import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import type { AutoTarget } from '@shared/progression/mastery';

async function invokeForge<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('forge', { body });
  if (error) {
    let msg = error.message;
    const ctx = (error as unknown as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const j = (await ctx.json()) as { error?: string };
        if (j?.error) msg = j.error;
      } catch {
        /* ignore */
      }
    }
    throw new Error(msg);
  }
  if (!data) throw new Error('Réponse vide du serveur');
  return data;
}

/**
 * Résultat d'UN LOT d'auto-craft. La série entière peut tenir en plusieurs lots
 * (cf. `AUTO_CHUNK`) : `reached` dit qu'on tient la cible, `stopped` porte la
 * raison d'un arrêt sec (plus d'or, plus de matériaux) — ce n'est PAS une
 * erreur, tout ce qui est déjà sorti est acquis.
 */
export type AutoCraftResult = {
  items: CraftedItem[];
  attempts: number;
  reached: boolean;
  xp_gain: number;
  stopped: string | null;
};

export type UpgradeResult = { success: boolean; upgrade_level: number };
export type RefineResult = { success: boolean; upgrade_level: number; passive_value: number };
export type BlessResult = { ok: boolean; blessing_level: number };

export type CraftedItem = {
  id: string;
  name: string;
  rarity: string;
  item_type: string;
  tier: number;
  atk_bonus: number;
  def_bonus: number;
  hp_bonus: number;
  passive_type: string | null;
  passive_value: number;
};

export function useForge() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['items', userId] });
    void queryClient.invalidateQueries({ queryKey: ['profile', userId] });
    void queryClient.invalidateQueries({ queryKey: ['resources', userId] });
    void queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
  };

  const craft = useMutation({
    /** `bossMaterialId` null = aucune essence, donc aucune stat secondaire. */
    mutationFn: (args: { baseId: string; materialId: string; bossMaterialId?: string | null }) =>
      invokeForge<{ item: CraftedItem; forge_xp?: number }>({
        action: 'craft',
        base_id: args.baseId,
        material_id: args.materialId,
        ...(args.bossMaterialId ? { boss_material_id: args.bossMaterialId } : {}),
      }),
    onSuccess: invalidate,
  });

  const craftJewel = useMutation({
    mutationFn: (args: { materialId: string; gemId: string }) =>
      invokeForge<{ item: CraftedItem; jewel_xp?: number }>({
        action: 'craft_jewel',
        material_id: args.materialId,
        gem_id: args.gemId,
      }),
    onSuccess: invalidate,
  });

  const craftRelic = useMutation({
    /** `bossMaterialId` null = aucune essence, donc relique mono-stat. */
    mutationFn: (args: { baseId: string; materialId: string; bossMaterialId?: string | null }) =>
      invokeForge<{ item: CraftedItem; relic_xp?: number }>({
        action: 'craft_relic',
        base_id: args.baseId,
        material_id: args.materialId,
        ...(args.bossMaterialId ? { boss_material_id: args.bossMaterialId } : {}),
      }),
    onSuccess: invalidate,
  });

  /**
   * Un lot d'auto-craft : le serveur enchaîne les tentatives jusqu'à la cible,
   * la panne de ressources ou `maxAttempts`. C'était une boucle de 300 requêtes
   * dans le navigateur — perdue si l'onglet se fermait.
   */
  const autoCraft = useMutation({
    mutationFn: (args: {
      kind: 'weapon' | 'jewel' | 'relic';
      materialId: string;
      target: AutoTarget;
      maxAttempts: number;
      baseId?: string;
      gemId?: string;
      bossMaterialId?: string | null;
    }) =>
      invokeForge<AutoCraftResult>({
        action: 'auto_craft',
        kind: args.kind,
        material_id: args.materialId,
        target: args.target,
        max_attempts: args.maxAttempts,
        ...(args.baseId ? { base_id: args.baseId } : {}),
        ...(args.gemId ? { gem_id: args.gemId } : {}),
        ...(args.bossMaterialId ? { boss_material_id: args.bossMaterialId } : {}),
      }),
    onSuccess: invalidate,
  });

  const upgrade = useMutation({
    mutationFn: (itemId: string) =>
      invokeForge<UpgradeResult>({ action: 'upgrade', item_id: itemId }),
    onSuccess: invalidate,
  });

  const refineJewel = useMutation({
    mutationFn: (itemId: string) =>
      invokeForge<RefineResult>({ action: 'refine_jewel', item_id: itemId }),
    onSuccess: invalidate,
  });

  const bless = useMutation({
    mutationFn: (itemId: string) =>
      invokeForge<BlessResult>({ action: 'bless', item_id: itemId }),
    onSuccess: invalidate,
  });

  const craftSet = useMutation({
    mutationFn: (args: { pieceId: string; materialId: string }) =>
      invokeForge<{ item: CraftedItem }>({
        action: 'craft_set',
        piece_id: args.pieceId,
        material_id: args.materialId,
      }),
    onSuccess: invalidate,
  });

  /** Forge Sacrée : la Relique divine (Éclat sacré + farm de zone + gemme). Arc 2. */
  const craftDivineRelic = useMutation({
    mutationFn: (args: { baseId: string; materialId: string; gemId: string }) =>
      invokeForge<{ item: CraftedItem }>({
        action: 'craft_divine_relic',
        base_id: args.baseId,
        material_id: args.materialId,
        gem_id: args.gemId,
      }),
    onSuccess: invalidate,
  });

  return {
    craft,
    craftJewel,
    craftRelic,
    autoCraft,
    upgrade,
    refineJewel,
    craftSet,
    bless,
    craftDivineRelic,
  };
}
