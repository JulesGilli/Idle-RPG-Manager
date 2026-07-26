/**
 * ZONE de craft d'un objet ÉQUIPÉ — tous types, tous arcs, une seule règle.
 *
 * Trois familles d'objets ne portent PAS de suffixe de zone dans leur nom et
 * cassaient donc `materialZoneOfName` :
 *   • les PIÈCES DE SET (« Grimoire du Tacticien ») — zone via `craft_cost` ou
 *     inversion de stats (`setPieceZone`) ;
 *   • les objets DIVINS (« ✦ Épée [épithète de gemme] ») — zone via `craft_cost`,
 *     repli zone 10 (un Divin est du end-game) ;
 *   • tout l'équipement d'ARC 2, dont le suffixe est reformulé (pas une extension
 *     de celui d'arc 1) — il faut le catalogue `FORGE_MATERIALS_ARC2`.
 *
 * Cette fonction est la SOURCE UNIQUE de « quelle zone » pour la logique de jeu
 * (succès « Paré d'étoiles », coût de renforcement…). Elle a été extraite du
 * chemin de renforcement de la forge, où la même cascade vivait en clair : la
 * dupliquer, c'était garantir qu'un jour l'un des deux compterait un Divin ou
 * une pièce de set là où l'autre ne le ferait pas.
 */
import { FORGE_MATERIALS_ARC2 } from './arcMaterials.ts';
import { materialZoneOfCraftCost, materialZoneOfName } from './forge.ts';
import { setPieceZone, type ZoneProbe } from './sets.ts';
import { isDivineItemName } from './divine.ts';

/** Zone du matériau de craft d'un objet (0 si indéductible). */
export function itemCraftZone(item: ZoneProbe): number {
  // DIVIN : le nom porte le sceau + l'épithète de la gemme, jamais un suffixe de
  // zone ; la zone vit dans `craft_cost` (clés d'arc 2 stockées au craft). Repli
  // zone 10 : un Divin ne se forge qu'en fin de partie, jamais en chêne.
  if (isDivineItemName(item.name)) {
    return materialZoneOfCraftCost(item.craft_cost, FORGE_MATERIALS_ARC2) || 10;
  }
  // PIÈCE DE SET : nom sans suffixe → `craft_cost` (deux arcs) puis inversion de
  // stats déterministe.
  if (item.set_id) return setPieceZone(item);
  // OBJET ORDINAIRE : suffixe de nom (les DEUX arcs), puis `craft_cost` en repli
  // pour les rares objets dont le nom aurait été altéré.
  return (
    materialZoneOfName(item.name, FORGE_MATERIALS_ARC2) ||
    materialZoneOfCraftCost(item.craft_cost, FORGE_MATERIALS_ARC2)
  );
}
