/**
 * Bénédiction d'arme (Arc 2). Voie d'amélioration PARALLÈLE au renforcement, qui
 * amplifie l'AMPLIFICATEUR DE TYPE d'une arme (physique / magique / soin), pas ses
 * stats brutes. Représentée par des ÉTOILES ROUGES (vs étoiles normales du renfo).
 *
 * Règles (cf. docs/refonte-v2.md §7) :
 *  - Armes uniquement, et seulement celles qui portent un `typeBonus` (toutes).
 *  - Consomme une ressource ULTRA-RARE (larme astrale) + de l'or.
 *  - Plafonnée par le niveau de RENFORCEMENT atteint : blessing_level ≤ upgrade_level
 *    (« +5 renfo → jusqu'à +5 bénédiction ») et ≤ BLESSING_MAX.
 *  - Une fois bénie (blessing_level > 0), l'arme ne peut PLUS être renforcée
 *    (verrou appliqué côté action `upgrade`).
 * Pur et partagé front + Edge Function.
 */
import { FORGE_BASES, type Recipe, type WeaponTypeBonus } from './forge.ts';

/** Niveau de bénédiction maximum (aussi plafonné par le niveau de renforcement). */
export const BLESSING_MAX = 10;

/** Gain relatif de l'amplificateur de type par niveau de bénédiction (×2.5 au max). */
export const BLESSING_STEP = 0.15;

/** Ressource ultra-rare consommée par la bénédiction (clé `player_resources`). */
export const BLESSING_RESOURCE = 'larme_astrale';

/** Amplificateur de type d'un modèle d'arme forgeable (null si inexistant). */
export function weaponTypeBonus(baseId: string): WeaponTypeBonus | null {
  return FORGE_BASES.find((b) => b.id === baseId)?.typeBonus ?? null;
}

/**
 * Modèle de forge (baseId) déduit du NOM d'un objet (« Épée de givre » → `epee`).
 * Match sur le préfixe = label du modèle, du plus long au plus court pour éviter
 * les faux positifs (« Grande épée … » ne doit pas matcher « Épée »).
 */
export function baseIdOfName(name: string): string | null {
  const n = name.toLowerCase();
  const sorted = [...FORGE_BASES].sort((a, b) => b.label.length - a.label.length);
  for (const b of sorted) if (n.startsWith(b.label.toLowerCase())) return b.id;
  return null;
}

/** Amplificateur de type effectif d'une arme à un niveau de bénédiction donné. */
export function blessedTypeBonusPct(basePct: number, blessingLevel: number): number {
  return basePct * (1 + BLESSING_STEP * Math.max(0, blessingLevel));
}

/**
 * Coût de la bénédiction pour passer de `level` à `level + 1`.
 *
 * L'OR grimpe (au carré), la LARME reste presque plate : 2 larmes jusqu'au +5,
 * 3 ensuite — soit 25 pour un +10 complet.
 *
 * Elle coûtait `level + 1` larmes, donc 55 pour un +10 : à comparer aux 3 larmes
 * d'un éveil de héros et aux 2 d'une rune, qui puisent dans LA MÊME ressource
 * (cf. runes.ts). Une seule arme bénie valait 18 éveils. Les trois coûts
 * n'avaient jamais été pensés ensemble ; celui-ci revient à leur échelle.
 *
 * Le principe : c'est l'or qui porte l'escalade, pas la ressource rare. L'or se
 * farme sans plafond ; la larme tombe au compte-gouttes sur les boss de donjon
 * (0-1 au T1 → 3-4 au T4, ~8/jour en jouant les quatre). La faire escalader
 * AUSSI, c'est multiplier deux raretés l'une par l'autre — et un joueur qui vise
 * les armes de ses 9 héros n'en verrait jamais le bout.
 */
export function blessingCost(level: number): Recipe {
  return {
    gold: 500 * (level + 1) * (level + 1),
    materials: [{ key: BLESSING_RESOURCE, qty: 2 + Math.floor(Math.max(0, level) / 5) }],
  };
}

export type BlessCheck = { ok: boolean; reason?: string };

/**
 * Valide une bénédiction : arme bénissable, plafonds (BLESSING_MAX + niveau de
 * renforcement). Pur → réutilisé côté serveur (anti-triche) et côté UI.
 */
export function validateBless(
  itemName: string,
  itemType: string,
  upgradeLevel: number,
  blessingLevel: number,
): BlessCheck {
  if (itemType !== 'weapon') return { ok: false, reason: 'Seules les armes se bénissent' };
  const baseId = baseIdOfName(itemName);
  if (!baseId || !weaponTypeBonus(baseId)) return { ok: false, reason: 'Arme non bénissable' };
  if (blessingLevel >= BLESSING_MAX) return { ok: false, reason: 'Bénédiction maximale atteinte' };
  if (blessingLevel >= upgradeLevel) {
    return { ok: false, reason: 'Renforce davantage l’arme (bénédiction plafonnée par le renforcement)' };
  }
  return { ok: true };
}
