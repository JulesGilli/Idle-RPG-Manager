/**
 * FORGE SACRÉE — qualité DIVINE (Arc 2, au-dessus d'Ultime).
 *
 * Elle ne forge QUE des ARMES et des ARMURES : les slots bijou et relique sont
 * couverts par les SETS d'Arc 2. Un objet Divin se forge avec trois ingrédients :
 *   • un MATÉRIAU D'EVENT (top 10 hebdo) → ce qui le rend Divin. Éclat sacré pour
 *     l'arme (World Boss), Poussière bénie pour l'armure (week-end) ;
 *   • un MATÉRIAU DE ZONE → ses stats de BASE ;
 *   • une GEMME → son EFFET UNIQUE (un passif, pas des stats brutes — pour ne
 *     pas nourrir l'inflation de stats).
 *
 * Divin n'est PAS une rareté de plus dans l'échelle poor→ultime : c'est un
 * ULTIME dopé qui, en plus de ses stats, porte un passif de gemme — la
 * combinaison stats + passif sur une arme/armure est ce qui fait sa valeur.
 *
 * Logique PURE (stats, effet, recette, coût). Partagé front + Edge Function.
 */
import type { GemDef } from './jewelry.ts';
import type { ForgeBase, ForgeMaterialTheme, Recipe } from './forge.ts';
import { craftItemAtRarity } from './forge.ts';
import { EVENT_MATERIALS, divineMaterialFor } from './eventMaterials.ts';

/**
 * Prime de stats du Divin sur un Ultime maxé : +20 %. « Au-dessus mais pas
 * over-pété » — un cran net, pas un gouffre. La borne vit ici, seule.
 */
export const DIVINE_STAT_MULT = 1.2;

/**
 * Matériaux d'event exigés par objet Divin. Le coût est PAR SLOT parce que les
 * deux robinets n'ont rien à voir :
 *
 *  • ARME — Éclat sacré, distribué au CLASSEMENT hebdo du World Boss. 3 = la part
 *    du 5e (`eventRankMaterialQty(5)`) : le top 5 forge une arme par semaine, et
 *    hors top 10 on n'en voit jamais. Monnaie de compétition, très rare.
 *  • ARMURE — Poussière bénie, gagnée aux CHAMPS DE BATAILLE : jusqu'à 12/jour
 *    (4 sorties × 3 au meilleur palier). Monnaie d'effort, abondante. Au tarif de
 *    l'arme (3), on forgerait 4 armures par jour.
 *
 * 40 vise ~3-4 jours d'assiduité au dernier palier, ~10 jours en milieu de
 * tableau (4 sorties × 1-2 poussières). ⚠️ Premier jet, à repasser au simulateur.
 */
export const DIVINE_EVENT_COST_BY_SLOT = { weapon: 3, armor: 40 } as const;

/** Coût en matériau d'event d'un objet Divin, selon le type d'objet forgé. */
export function divineEventCost(itemType: 'weapon' | 'armor'): number {
  return DIVINE_EVENT_COST_BY_SLOT[itemType];
}

/** Seuls l'arme et l'armure sont forgeables en Divin. */
export function isDivineForgeable(base: ForgeBase): boolean {
  return base.itemType === 'weapon' || base.itemType === 'armor';
}

export type DivineStats = { atk: number; def: number; hp: number };

/**
 * Stats de base d'un objet Divin : celles d'un ULTIME du même modèle et de la
 * même zone (sans essence de boss : la gemme prend ce rôle), majorées de
 * `DIVINE_STAT_MULT`. On réutilise `craftItemAtRarity` pour rester exactement
 * calé sur l'échelle des armes/armures — profil du modèle inclus (biais).
 */
export function divineStats(base: ForgeBase, mat: ForgeMaterialTheme): DivineStats {
  const ult = craftItemAtRarity(base, mat, null, 'ultimate');
  return {
    atk: Math.round(ult.atk_bonus * DIVINE_STAT_MULT),
    def: Math.round(ult.def_bonus * DIVINE_STAT_MULT),
    hp: Math.round(ult.hp_bonus * DIVINE_STAT_MULT),
  };
}

export type DivinePassive = { type: GemDef['passive']; value: number };

/**
 * Effet unique d'un objet Divin : le passif de la gemme, à son PLAFOND (% entier,
 * comme un bijou en base). Un objet de fin de partie ne rogne pas sur sa gemme.
 */
export function divinePassive(gem: GemDef): DivinePassive {
  return { type: gem.passive, value: gem.maxPct };
}

/** Nom d'un objet Divin : modèle + gemme, préfixé du sceau divin. */
export function divineName(base: ForgeBase, gem: GemDef): string {
  return `✦ ${base.label} ${gem.epithet}`;
}

/**
 * Recette d'un objet Divin : matériau d'event du slot (Éclat sacré pour l'arme,
 * Poussière bénie pour l'armure) + farm de la zone (stats de base) + 1 gemme.
 * Pas d'essence de boss : la gemme la remplace.
 */
export function divineRecipe(base: ForgeBase, mat: ForgeMaterialTheme, gem: GemDef): Recipe {
  const slot = base.itemType === 'weapon' ? 'weapon' : 'armor';
  const eventMat =
    slot === 'weapon'
      ? EVENT_MATERIALS.world_boss // Éclat sacré
      : divineMaterialFor('armor'); // Poussière bénie
  return {
    gold: mat.gold + 5000,
    materials: [
      { key: eventMat.key, qty: divineEventCost(slot) },
      ...mat.materials.map((m) => ({ ...m })),
      { key: gem.id, qty: 1 },
    ],
  };
}
