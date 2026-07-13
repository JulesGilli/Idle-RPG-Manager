/**
 * Éveil des héros + Runes (V2, end-game — cf. docs/refonte-v2.md §12).
 *
 * ÉVEIL : un héros de grade S au niveau maximum peut être éveillé → débloque UN
 * slot de rune. RUNES : on sacrifie un set complet (les 2 pièces d'un set à effet
 * 2-pièces) + des matériaux rares pour EXTRAIRE son effet dans une rune. Posée sur
 * un héros éveillé, la rune lui accorde cet effet de set — sans porter le set.
 *
 * V2 : seuls les sets à effet 2-pièces sont extractibles (les gros sets 4-pièces
 * viendront dans une MAJ ultérieure). L'effet de rune ignore la restriction de
 * poids du set (l'éveil transcende les contraintes de classe).
 * Pur → serveur (validation) + UI.
 */
import type { Ability } from '../combat/types.ts';
import { SETS, setById, setEffectAt, type ItemSet } from './sets.ts';
import { MAX_LEVEL } from './formulas.ts';
import type { Grade } from './recruit.ts';

/** Niveau requis pour l'éveil (= niveau max). */
export const AWAKEN_LEVEL = MAX_LEVEL;

/** Ressource rare (larme astrale, Arc 2) consommée par l'éveil et le craft de rune. */
export const RUNE_RESOURCE = 'larme_astrale';

/** Coût de l'éveil d'un héros. */
export const AWAKEN_COST = { gold: 50_000, material: { key: RUNE_RESOURCE, qty: 3 } };

/** Coût du craft d'une rune (EN PLUS des 2 pièces de set sacrifiées). */
export const RUNE_CRAFT_COST = { gold: 20_000, material: { key: RUNE_RESOURCE, qty: 2 } };

/** Un héros peut-il être éveillé ? (grade S + niveau max — l'éveil lui-même non déjà fait.) */
export function canAwaken(grade: Grade, level: number, awakened: boolean): boolean {
  return !awakened && grade === 'S' && level >= AWAKEN_LEVEL;
}

/** Sets EXTRACTIBLES en rune (V2 : uniquement les sets à effet 2-pièces). */
export function runeExtractableSets(): ItemSet[] {
  return SETS.filter((s) => setEffectAt(s) === 2);
}

/** Ce set peut-il être scellé dans une rune ? */
export function isRuneSet(setId: string | null | undefined): boolean {
  const s = setById(setId ?? undefined);
  return Boolean(s && setEffectAt(s) === 2);
}

/**
 * Effet de combat accordé par une rune de ce set = l'effet 2-pièces extrait.
 * Ignore volontairement la restriction de poids du set (l'éveil transcende).
 */
export function runeAbilities(setId: string | null | undefined): Ability[] {
  const s = setById(setId ?? undefined);
  return s && setEffectAt(s) === 2 ? s.abilities4 : [];
}
