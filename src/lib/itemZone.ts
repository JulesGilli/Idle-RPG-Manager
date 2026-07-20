/**
 * Déduit la ZONE du matériau d'un objet à partir du suffixe de son nom
 * (« Épée de givre » → « de givre » → zone 2), comme l'inférence de modèle.
 * Cosmétique/front : sert au bandeau d'étoiles de puissance. Aucune data modifiée.
 */
import { FORGE_MATERIALS } from '@shared/progression/forge';
import { setPieceZone, type ZoneProbe } from '@shared/progression/sets';

// Suffixes triés du plus long au plus court pour éviter les faux positifs.
const ZONE_BY_SUFFIX = [...FORGE_MATERIALS]
  .map((m) => ({ zone: m.zone, suffix: m.suffix.toLowerCase() }))
  .sort((a, b) => b.suffix.length - a.suffix.length);

/**
 * Zone du matériau (0 si inconnue).
 *
 * Une pièce de set n'a pas de suffixe dans son nom : sa zone se déduit de son
 * coût de craft (`setPieceZone`). Elle était figée à 10 ici, ce qui affichait
 * 10 étoiles sur une pièce forgée en chêne — et le serveur en tirait la même
 * conclusion pour le coût d'amélioration.
 */
export function materialZone(item: ZoneProbe): number {
  if (item.set_id) return setPieceZone(item);
  const n = item.name.toLowerCase();
  for (const z of ZONE_BY_SUFFIX) if (n.includes(z.suffix)) return z.zone;
  return 0;
}

// Provenance d'une RESSOURCE (clé `player_resources`) : première zone où ce
// matériau est requis par un composant de forge. Donne zone + tier (= arc).
// Les gemmes / butin de donjon / matériaux d'expé n'y figurent pas → inconnus.
const SOURCE_BY_KEY: Record<string, { zone: number; tier: number }> = (() => {
  const map: Record<string, { zone: number; tier: number }> = {};
  for (const m of FORGE_MATERIALS) {
    for (const mat of m.materials) {
      if (!(mat.key in map)) map[mat.key] = { zone: m.zone, tier: m.craftTier };
    }
  }
  return map;
})();

/** Zone + tier (arc) d'un matériau de zone. `null` si la provenance est inconnue. */
export function materialSource(key: string): { zone: number; tier: number } | null {
  return SOURCE_BY_KEY[key] ?? null;
}
