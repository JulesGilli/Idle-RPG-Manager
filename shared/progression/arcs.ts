/**
 * ARCS : la carte est découpée en arcs successifs. Chaque arc porte un TIER de
 * matériaux (1 → 4). On termine un arc en battant son BOSS D'ARC (une rencontre
 * spéciale, distincte du farm de carte) ; le battre débloque l'arc suivant ET
 * son tier de matériaux de craft.
 *
 * Cette itération peuple entièrement l'Arc 1 (tier 1 = contenu live actuel) ;
 * les arcs 2 à 4 sont définis (le système les gère) mais leurs zones/tiers
 * restent à seeder.
 *
 * Pur et partagé front + Edge Function. Aucune I/O.
 */

export type ArcDef = {
  /** 1-based. */
  index: number;
  /** Tier de matériaux débloqué en terminant cet arc (= index pour l'instant). */
  tier: number;
  id: string;
  name: string;
  /** Zones de la carte (map ids) appartenant à l'arc. Vide = à peupler. */
  mapIds: string[];
  /** Boss d'arc à vaincre pour débloquer l'arc suivant + son tier. */
  gateBossId: string;
};

/** Tier de matériaux maximum (nombre d'arcs). */
export const MAX_ARC_TIER = 4;

export const ARCS: ArcDef[] = [
  {
    index: 1,
    tier: 1,
    id: 'arc1',
    name: 'Les Marches Boisées',
    mapIds: ['forest', 'caverns'],
    gateBossId: 'arc1_gate',
  },
  { index: 2, tier: 2, id: 'arc2', name: 'Arc II', mapIds: [], gateBossId: 'arc2_gate' },
  { index: 3, tier: 3, id: 'arc3', name: 'Arc III', mapIds: [], gateBossId: 'arc3_gate' },
  { index: 4, tier: 4, id: 'arc4', name: 'Arc IV', mapIds: [], gateBossId: 'arc4_gate' },
];

export function arcByIndex(index: number): ArcDef | undefined {
  return ARCS.find((a) => a.index === index);
}

export function arcOfMap(mapId: string): ArcDef | undefined {
  return ARCS.find((a) => a.mapIds.includes(mapId));
}

export function arcByGateBoss(gateBossId: string): ArcDef | undefined {
  return ARCS.find((a) => a.gateBossId === gateBossId);
}

/**
 * Tier de matériaux de craft débloqué : `1 + nombre de boss d'arc vaincus`,
 * plafonné à `MAX_ARC_TIER`. Seuls les gate bosses connus comptent.
 */
export function unlockedMaterialTier(clearedGateBossIds: string[]): number {
  const valid = new Set(ARCS.map((a) => a.gateBossId));
  const count = new Set(clearedGateBossIds.filter((id) => valid.has(id))).size;
  return Math.min(MAX_ARC_TIER, 1 + count);
}
