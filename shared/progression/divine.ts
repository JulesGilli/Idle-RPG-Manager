/**
 * FORGE SACRÉE — qualité DIVINE (Arc 2, au-dessus d'Ultime).
 *
 * Un objet Divin se forge avec trois ingrédients (cf. roadmap) :
 *   • un MATÉRIAU D'EVENT (top 10 hebdo) → ce qui le rend Divin ;
 *   • un MATÉRIAU DE ZONE → ses stats de BASE ;
 *   • une GEMME → son EFFET UNIQUE (un passif, pas des stats brutes — pour ne
 *     pas nourrir l'inflation de stats).
 *
 * Divin n'est PAS une rareté de plus dans l'échelle poor→ultime : c'est un
 * ULTIME dopé qui, en plus de ses stats brutes, porte un passif de gemme —
 * normalement l'apanage des bijoux. La combinaison stats + passif sur une même
 * pièce est ce qui fait sa valeur, sans stat brute délirante.
 *
 * Ce fichier est la LOGIQUE PURE (stats, effet, recette, coût). La façon dont
 * l'objet est stocké et l'action serveur (gating Arc 2) viennent au-dessus.
 * Partagé front + Edge Function.
 */
import type { GemDef } from './jewelry.ts';
import type { ForgeMaterialTheme, Recipe } from './forge.ts';
import type { RelicBase } from './relic.ts';
import { craftRelicAtRarity } from './relic.ts';
import { EVENT_MATERIALS } from './eventMaterials.ts';

/**
 * Prime de stats du Divin sur un Ultime maxé : +20 %. « Au-dessus mais pas
 * over-pété » — un cran net, pas un gouffre. La borne vit ici, seule.
 */
export const DIVINE_STAT_MULT = 1.2;

/**
 * Éclats sacrés exigés pour une Relique divine. 3 = la part du 5e au classement
 * hebdo du World Boss (`eventRankMaterialQty(5)`), donc le top 5 forge bien une
 * pièce par semaine — la règle du roadmap. Le rééquilibrer = toucher cette ligne.
 */
export const DIVINE_EVENT_COST = 3;

export type DivineStats = { atk: number; def: number; hp: number };

/**
 * Stats de base d'une Relique divine : celles d'un Ultime MONO-STAT du même
 * modèle et de la même zone (pas d'essence : la gemme prend ce rôle), majorées
 * de `DIVINE_STAT_MULT`. On réutilise `craftRelicAtRarity` pour rester
 * exactement calé sur l'échelle des reliques.
 */
export function divineRelicStats(base: RelicBase, mat: ForgeMaterialTheme): DivineStats {
  const ult = craftRelicAtRarity(base, mat, null, 'ultimate');
  return {
    atk: Math.round(ult.atk_bonus * DIVINE_STAT_MULT),
    def: Math.round(ult.def_bonus * DIVINE_STAT_MULT),
    hp: Math.round(ult.hp_bonus * DIVINE_STAT_MULT),
  };
}

export type DivinePassive = { type: GemDef['passive']; value: number };

/**
 * Effet unique d'une Relique divine : le passif de la gemme, à son PLAFOND.
 * Un objet de fin de partie ne rogne pas sur l'effet de sa gemme — c'est la
 * récompense d'y être arrivé. Le raffinage (montée du %) ne s'applique donc pas.
 */
export function divineRelicPassive(gem: GemDef): DivinePassive {
  return { type: gem.passive, value: gem.maxPct };
}

/** Nom d'une Relique divine : modèle + gemme, préfixé du sceau divin. */
export function divineRelicName(base: RelicBase, gem: GemDef): string {
  return `✦ ${base.label} ${gem.epithet}`;
}

/**
 * Recette d'une Relique divine : Éclat sacré (event) + farm de la zone (stats de
 * base) + 1 gemme (effet). Pas d'essence de boss : la gemme la remplace.
 */
export function divineRelicRecipe(mat: ForgeMaterialTheme, gem: GemDef): Recipe {
  return {
    gold: mat.gold + 5000,
    materials: [
      { key: EVENT_MATERIALS.world_boss.key, qty: DIVINE_EVENT_COST },
      ...mat.materials.map((m) => ({ ...m })),
      { key: gem.id, qty: 1 },
    ],
  };
}
