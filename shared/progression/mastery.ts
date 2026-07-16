/**
 * MAÎTRISE D'ATELIER — le moteur commun aux trois ateliers de craft.
 *
 * Forge, Joaillerie et Autel suivent exactement la même logique : une maîtrise
 * par joueur, alimentée par l'XP de chaque craft, qui améliore les probabilités
 * de rareté et la réussite des renforcements. Elle a pourtant été écrite trois
 * fois, à l'identique, dans `forge.ts` / `jewelry.ts` / `relic.ts` — au point que
 * `masteries.test.ts` existait uniquement pour vérifier que les trois copies
 * n'avaient pas divergé. Un test qui GARDE une duplication au lieu de la
 * supprimer, c'est le signal qu'il fallait factoriser.
 *
 * Ce fichier est cette factorisation : une seule courbe, un seul plafond, une
 * seule paire de tables de rareté. Les trois ateliers réexportent leurs alias
 * historiques (`forgeLevelInfo`, `jewelRarityWeights`…) — c'est du vocabulaire
 * de métier, pas de la logique, et rien n'oblige un appelant à changer.
 *
 * Si un atelier doit un jour VRAIMENT diverger, c'est ici qu'on paramètre —
 * pas en recopiant le fichier.
 *
 * Pur et partagé front + Edge Function.
 */
import { RARITY_ORDER, type Rarity } from './loot.ts';

/** Niveau de maîtrise maximal — le même pour les trois ateliers. */
export const MAX_MASTERY_LEVEL = 20;

/**
 * Niveau à partir duquel l'AUTO-craft se débloque, dans les trois ateliers.
 * Early game (~10 crafts/jour), crafter est un rituel : chaque objet compte et
 * le joueur frappe l'enclume lui-même. Late game (~60/jour), le volume rend le
 * rituel intenable — l'auto est la RÉCOMPENSE de la maîtrise, pas un raccourci :
 * « j'ai mérité de ne plus avoir à le faire ».
 */
export const AUTO_UNLOCK_LEVEL = 8;

/** L'auto-craft est-il débloqué à ce niveau de maîtrise ? */
export function autoUnlocked(masteryLevel: number): boolean {
  return masteryLevel >= AUTO_UNLOCK_LEVEL;
}

/**
 * Garde-fou dur d'une série d'auto-craft. En pratique ce sont les ressources qui
 * arrêtent la série bien avant — c'est un filet contre la boucle infinie, pas un
 * réglage d'équilibrage. Partagé : le serveur borne, le front affiche.
 */
export const AUTO_MAX_ATTEMPTS = 300;

/** Raretés qu'on peut viser en auto : en dessous, la série s'arrêterait aussitôt. */
export const AUTO_TARGETS = ['uncommon', 'advanced', 'ultimate'] as const;
export type AutoTarget = (typeof AUTO_TARGETS)[number];

/**
 * Taille d'un LOT d'auto-craft : la série tourne côté serveur, mais par paquets.
 *
 * D'un bloc, une série de 300 serait un seul appel — et dix secondes d'écran
 * mort, sans journal qui se remplit ni bouton Stop qui réponde. Par lots, on
 * garde les deux : le joueur voit tomber les pièces et peut couper entre deux
 * paquets, pour ~25× moins d'allers-retours qu'un craft-par-requête.
 */
export const AUTO_CHUNK = 25;

/**
 * Avancement 0→1 dans la maîtrise (Nv.1 = 0, Nv. plafond = 1), borné aux deux
 * bouts : un niveau hors plage ne doit jamais extrapoler les probas.
 */
function masteryProgress(masteryLevel: number): number {
  const denom = MAX_MASTERY_LEVEL - 1;
  if (denom <= 0) return 0;
  return Math.min(1, Math.max(0, (masteryLevel - 1) / denom));
}

/** XP nécessaire pour passer de `level` à `level + 1` (courbe douce). */
function masteryXpStep(level: number): number {
  return 80 + 40 * level;
}

export type MasteryLevelInfo = {
  level: number;
  xpInto: number;
  xpForNext: number;
  totalXp: number;
};

/** Dérive le niveau de maîtrise (et la progression) à partir de l'XP totale. */
export function masteryLevelInfo(totalXp: number): MasteryLevelInfo {
  const xp = Math.max(0, Math.floor(totalXp));
  let level = 1;
  let remaining = xp;
  while (level < MAX_MASTERY_LEVEL) {
    const step = masteryXpStep(level);
    if (remaining < step) return { level, xpInto: remaining, xpForNext: step, totalXp: xp };
    remaining -= step;
    level += 1;
  }
  return { level: MAX_MASTERY_LEVEL, xpInto: 0, xpForNext: 0, totalXp: xp };
}

/**
 * Ce que la maîtrise retient d'un composant pour chiffrer l'XP. Volontairement
 * structurel plutôt qu'un import de `ForgeMaterialTheme` : `forge.ts` dépend de
 * ce fichier, l'inverse créerait un cycle pour deux champs.
 */
export type MasteryXpSource = { zone: number; craftTier: number };

/** XP gagnée par craft (plus la zone/tier du composant est haute, plus ça rapporte). */
export function masteryXpGain(mat: MasteryXpSource): number {
  return Math.round(5 + mat.zone * 2 + mat.craftTier * 3);
}

// Distribution NOVICE (bas niveau : le bon stuff est très rare) →
// distribution MAÎTRE (haut niveau : nettement meilleur). Interpolées par niveau.
const RARITY_NOVICE: Record<Rarity, number> = {
  poor: 46,
  common: 37,
  uncommon: 12,
  advanced: 4,
  ultimate: 1,
};
const RARITY_MASTER: Record<Rarity, number> = {
  poor: 5,
  common: 20,
  uncommon: 35,
  advanced: 28,
  ultimate: 12,
};

/**
 * Poids de rareté d'un craft selon le niveau de maîtrise (1..MAX).
 * Interpolation linéaire novice → maître.
 */
export function craftRarityWeights(masteryLevel: number): Record<Rarity, number> {
  const p = masteryProgress(masteryLevel);
  const out = {} as Record<Rarity, number>;
  for (const r of RARITY_ORDER) {
    out[r] = RARITY_NOVICE[r] + (RARITY_MASTER[r] - RARITY_NOVICE[r]) * p;
  }
  return out;
}

/* ------------------------------------------------ MAÎTRISE ET RÉUSSITE ---- */

/**
 * Bonus de réussite apporté par la MAÎTRISE de l'atelier, en points de % ajoutés
 * à la chance de base. Jusqu'ici la maîtrise ne servait qu'au craft : un maître
 * forgeron sortait du meilleur stuff mais ratait ses renforcements aussi souvent
 * qu'un novice, ce qui n'avait aucun sens.
 *
 * Volontairement modeste : +15 points au niveau max. Au pire palier (+9→+10,
 * 32 % de base), ça fait passer de 32 % à 47 % — un vrai gain, mais le
 * renforcement reste un pari, comme le veut la mécanique d'échec.
 */
export const MASTERY_SUCCESS_BONUS_MAX = 0.15;

/** Plafond absolu de réussite : même un maître acharné peut rater. */
const SUCCESS_HARD_CAP = 0.95;

/** Bonus de réussite d'une maîtrise à ce niveau (0 au Nv.1 → max au plafond). */
export function masterySuccessBonus(masteryLevel: number): number {
  return MASTERY_SUCCESS_BONUS_MAX * masteryProgress(masteryLevel);
}

/**
 * ACHARNEMENT — points de % gagnés par échec CONSÉCUTIF sur le même objet,
 * remis à zéro dès la première réussite.
 *
 * Sans lui, le renforcement est une marche aléatoire à dérive négative : au
 * palier +9→+10 (32 % de base), rien n'empêche d'enchaîner six échecs, de payer
 * six fois `100×(niv+1)²` d'or et de finir plus bas qu'au départ. La malchance
 * n'est bornée par rien. L'acharnement ne retire pas le pari — il garantit
 * seulement qu'une série noire finit par céder : le mur devient une pente.
 *
 * Volontairement non plafonné en soi : c'est SUCCESS_HARD_CAP qui borne le
 * total, donc même dix échecs d'affilée ne rendent jamais la réussite certaine.
 */
export const PITY_STEP = 0.05;

/** Bonus d'acharnement après `failures` échecs consécutifs sur cet objet. */
export function pityBonus(failures: number): number {
  return PITY_STEP * Math.max(0, Math.floor(failures));
}

/**
 * Applique à une chance de base les deux bonus d'atelier — maîtrise (ce que tu
 * sais faire) et acharnement (ce que tu viens d'encaisser) — sous le plafond dur.
 * Sans aucun des deux, la valeur de base ressort intacte : les appels legacy et
 * les tests qui comparent à la formule nue restent exacts.
 */
export function withCraftBonuses(
  baseChance: number,
  masteryLevel?: number,
  failures = 0,
): number {
  const bonus =
    (masteryLevel === undefined ? 0 : masterySuccessBonus(masteryLevel)) + pityBonus(failures);
  if (bonus === 0) return baseChance;
  return Math.min(SUCCESS_HARD_CAP, baseChance + bonus);
}
