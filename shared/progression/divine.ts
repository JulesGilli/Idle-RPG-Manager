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
import { divineMaterialFor } from './eventMaterials.ts';
import { ETERNITY_RESOURCE } from './gauntlet.ts';

/** Sceau qui préfixe le NOM de tout objet Divin (cf. `divineName`). */
export const DIVINE_SEAL = '✦';

/** Cet objet est-il Divin ? (déduit du sceau `✦` en tête de nom.) */
export function isDivineItemName(name: string | null | undefined): boolean {
  return typeof name === 'string' && name.trimStart().startsWith(DIVINE_SEAL);
}

/**
 * Arc minimum pour forger un objet Divin. Le serveur REFUSE en deçà (403), donc
 * l'UI doit toujours présenter le catalogue de CET arc, jamais celui de l'arc
 * courant du visiteur : en arc 1 elle affichait des matériaux d'arc 1 que le
 * serveur n'aurait de toute façon jamais acceptés.
 */
export const DIVINE_MIN_ARC = 2;

/**
 * Prime de stats du Divin sur un Ultime maxé : +30 % (relevé de +20 % le 25 juil.
 * 2026). L'arme divine doit être la MEILLEURE du jeu — nettement au-dessus d'une
 * arme de zone 10 (Ultime), sans être un gouffre. La borne vit ici, seule.
 */
export const DIVINE_STAT_MULT = 1.3;

/**
 * Matériaux d'event exigés par objet Divin. Le coût est PAR SLOT parce que les
 * deux robinets n'ont rien à voir (REVU le 22 juil., mapping inversé) :
 *
 *  • ARMURE — Éclat sacré, distribué au CLASSEMENT hebdo du World Boss (barème à
 *    paliers : 1er → 7, top 3 → 5, top 5 → 3, top 10 → 1). 3 = la part du 5e :
 *    le top 5 forge une armure par semaine, et hors top 10 on n'en voit jamais.
 *    Monnaie de compétition, très rare.
 *  • ARME — Poussière bénie, gagnée à la DÉFENSE DU VILLAGE (champs de
 *    bataille) : 15 par victoire, cooldown 12 h PAR bataille (donc jusqu'à
 *    2 victoires/jour toutes batailles confondues = 30/jour max). Monnaie
 *    d'effort, abondante. 30 vise ~1 jour d'assiduité pleine, quelques jours en
 *    rythme normal. ⚠️ Premier jet, à repasser au simulateur.
 */
export const DIVINE_EVENT_COST_BY_SLOT = { weapon: 30, armor: 3 } as const;

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
 * L'ARMURE divine est un cran au-dessus de l'arme sur son terrain : PV et DEF
 * DOUBLÉS (par rapport au simple ×1.3), et elle porte en plus une STAT D'ATTAQUE
 * (les armures n'en ont normalement aucune) — ratio de sa DEF de base.
 * Décision du 26 juil. 2026 : l'armure divine doit transformer le porteur, pas
 * seulement le blinder.
 */
export const DIVINE_ARMOR_HPDEF_MULT = 2;
export const DIVINE_ARMOR_ATK_RATIO = 0.5;

/**
 * Stats de base d'un objet Divin : celles d'un ULTIME du même modèle et de la
 * même zone (sans essence de boss : la gemme prend ce rôle), majorées de
 * `DIVINE_STAT_MULT`. On réutilise `craftItemAtRarity` pour rester exactement
 * calé sur l'échelle des armes/armures — profil du modèle inclus (biais).
 *
 * ARMURE : PV/DEF ×2 supplémentaires + une stat d'ATK dérivée de la DEF divine
 * (avant doublement) — cf. `DIVINE_ARMOR_*` ci-dessus.
 */
export function divineStats(base: ForgeBase, mat: ForgeMaterialTheme): DivineStats {
  const ult = craftItemAtRarity(base, mat, null, 'ultimate');
  const atk = Math.round(ult.atk_bonus * DIVINE_STAT_MULT);
  const def = Math.round(ult.def_bonus * DIVINE_STAT_MULT);
  const hp = Math.round(ult.hp_bonus * DIVINE_STAT_MULT);
  if (base.itemType === 'armor') {
    return {
      atk: atk + Math.round(def * DIVINE_ARMOR_ATK_RATIO),
      def: def * DIVINE_ARMOR_HPDEF_MULT,
      hp: hp * DIVINE_ARMOR_HPDEF_MULT,
    };
  }
  return { atk, def, hp };
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
  return `${DIVINE_SEAL} ${base.label} ${gem.epithet}`;
}

/**
 * RENFORCEMENT d'un objet Divin (passage de `level` à `level+1`).
 *
 * Système SPÉCIAL, distinct du renforcement ordinaire (`upgradeCost`) :
 *  • il ne consomme PAS le matériau de farm de zone, mais l'ÉCLAT D'ÉTERNITÉ
 *    (`ETERNITY_RESOURCE`), l'unique ressource produite par le Gauntlet ;
 *  • il RÉUSSIT à 100 % (aucun risque de recul) — cf. la branche `upgrade` de la
 *    fonction `forge`, qui court-circuite le tirage de réussite pour les Divins.
 *
 * L'or grimpe au carré ; l'Éclat monte linéairement (4 par niveau). Un +10
 * complet coûte 4·(1+…+10) = 220 Éclats et 3,85 M d'or — c'est un sink de FIN DE
 * JEU, ~6 jours de rente au plafond de production (×2 le 25 juil. 2026 : les
 * premiers chiffres se maxaient en <3 jours). Seul levier, avec `eternityPerDay`.
 *
 * `zoneMaterialKey` : le matériau de FARM de la zone du craft de l'objet (déjà
 * traduit dans l'arc du joueur), consommé EN PLUS de l'Éclat — même quantité que
 * le renforcement ordinaire (3·(niveau+1)). Le farm de zone garde ainsi sa
 * valeur jusqu'au bout du end-game. Omis (appels d'aperçu sans zone) → Éclat seul.
 */
export function divineUpgradeCost(level: number, zoneMaterialKey?: string | null): Recipe {
  return {
    gold: 10_000 * (level + 1) * (level + 1),
    materials: [
      { key: ETERNITY_RESOURCE, qty: 4 * (level + 1) },
      ...(zoneMaterialKey ? [{ key: zoneMaterialKey, qty: 3 * (level + 1) }] : []),
    ],
  };
}

/**
 * Recette d'un objet Divin : matériau d'event du slot (Poussière bénie pour
 * l'arme, Éclat sacré pour l'armure — cf. `divineMaterialFor`) + farm de la
 * zone (stats de base) + 1 gemme. Pas d'essence de boss : la gemme la remplace.
 */
export function divineRecipe(base: ForgeBase, mat: ForgeMaterialTheme, gem: GemDef): Recipe {
  const slot = base.itemType === 'weapon' ? 'weapon' : 'armor';
  const eventMat = divineMaterialFor(slot);
  return {
    gold: mat.gold + 5000,
    materials: [
      { key: eventMat.key, qty: divineEventCost(slot) },
      ...mat.materials.map((m) => ({ ...m })),
      { key: gem.id, qty: 1 },
    ],
  };
}
