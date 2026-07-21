/**
 * TRANSMUTATION DE GEMMES
 *
 * Les gemmes ne tombent que sur les boss de zone, à 2 % (`GEM_DROP_CHANCE`).
 * Un joueur accumule donc fatalement des gemmes dont il ne veut pas — celles
 * des zones qu'il farme — sans jamais voir celle qu'il vise. La transmutation
 * ouvre une soupape : on SACRIFIE deux gemmes (n'importe lesquelles) et on paie
 * en composants de la zone VISÉE, ce qui rend l'échange coûteux là où il compte.
 *
 * Le prix est volontairement asymétrique : les gemmes sacrifiées sont
 * interchangeables (deux gemmes de zone 1 valent deux gemmes de zone 10), mais
 * les 30 composants, eux, doivent venir de la zone cible. Viser une gemme de
 * zone 10 exige donc de farmer la zone 10 — la difficulté reste dans la
 * destination, jamais dans la monnaie d'échange.
 *
 * Aucun multiplicateur d'arc n'est appliqué : `forgeCostMult` renchérit les
 * crafts d'arc 2, mais l'appliquer ici ferait payer 5 gemmes une conversion,
 * alors que les gemmes sont déjà la ressource la plus rare du jeu. On paie le
 * même prix dans les deux arcs, chacun dans SA propre monnaie (les jumeaux
 * d'arc 2 pour un joueur d'arc 2).
 *
 * Pur et partagé front + Edge Function.
 */
import type { Recipe } from './forge.ts';
import type { GemDef } from './jewelry.ts';
import { forgeMaterialsForArc, gemsForArc } from './arcMaterials.ts';

/** Nombre de gemmes sacrifiées pour en obtenir une seule. */
export const TRANSMUTE_GEM_QTY = 2;

/** Composants de la zone CIBLE exigés en plus des gemmes. */
export const TRANSMUTE_MATERIAL_QTY = 30;

/**
 * Composant de farm principal d'une zone, dans l'arc donné.
 *
 * Pendant arc-conscient de `zoneFarmMaterial` (qui ne connaît que l'arc 1) :
 * en arc 2 il faut la clé du JUMEAU, sinon la recette réclamerait des
 * ressources d'arc 1 que le joueur d'arc 2 ne gagne plus.
 */
export function zoneFarmMaterialForArc(zone: number, arc: number): string | null {
  const theme = forgeMaterialsForArc(arc).find((m) => m.zone === zone);
  return theme?.materials[0]?.key ?? null;
}

/**
 * Coût d'une transmutation vers `target`, payé avec des gemmes `source`.
 *
 * Renvoie `null` si l'échange n'a pas de sens : même gemme en entrée et en
 * sortie (le joueur perdrait une gemme pour rien), ou zone cible sans composant
 * connu. La validation d'appartenance à l'arc se fait en amont, via
 * `gemForArc` — ici on suppose les deux gemmes déjà résolues dans le bon arc.
 */
export function gemTransmuteRecipe(source: GemDef, target: GemDef, arc: number): Recipe | null {
  if (source.id === target.id) return null;
  const matKey = zoneFarmMaterialForArc(target.zone, arc);
  if (!matKey) return null;
  return {
    gold: 0,
    materials: [
      { key: source.id, qty: TRANSMUTE_GEM_QTY },
      { key: matKey, qty: TRANSMUTE_MATERIAL_QTY },
    ],
  };
}

/**
 * Gemmes que le joueur peut SACRIFIER pour viser `targetId` : toutes celles de
 * l'arc sauf la cible elle-même.
 */
export function transmuteSources(targetId: string, arc: number): GemDef[] {
  return gemsForArc(arc).filter((g) => g.id !== targetId);
}
