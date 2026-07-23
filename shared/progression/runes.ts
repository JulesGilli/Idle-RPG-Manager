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
import { SETS, setById, setEffectAt, classCanUseSet, type ItemSet } from './sets.ts';
import { MAX_LEVEL } from './formulas.ts';
import type { Grade } from './recruit.ts';

/** Niveau requis pour l'éveil (= niveau max). */
export const AWAKEN_LEVEL = MAX_LEVEL;

/** Ressource rare (larme astrale, Arc 2) consommée par l'éveil et le craft de rune. */
export const RUNE_RESOURCE = 'larme_astrale';

/** Coût de l'éveil d'un héros. */
export const AWAKEN_COST = { gold: 500_000, material: { key: RUNE_RESOURCE, qty: 30 } };

/** Coût du craft d'une rune (EN PLUS des 2 pièces de set sacrifiées). */
export const RUNE_CRAFT_COST = { gold: 200_000, material: { key: RUNE_RESOURCE, qty: 20 } };

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

/**
 * L'effet de la rune est-il NEUTRALISÉ parce que le héros porte DÉJÀ ce set ?
 *
 * Un même effet de set ne se cumule pas avec lui-même : équiper les 2 pièces de
 * la Parure X ET porter la rune de la Parure X ne doit donner l'effet qu'UNE
 * fois — sinon la rune servirait à doubler un effet au lieu d'en libérer un
 * second. La règle est volontairement indexée sur l'IDENTITÉ DU SET, pas sur la
 * nature de l'effet : deux sets DIFFÉRENTS aux effets voisins (p. ex. Parure de
 * l'Arcaniste et Parure du Verbe Ancien, toutes deux « amplifie l'arcane ») se
 * cumulent, eux, tout à fait normalement.
 *
 * On ne neutralise que si l'équipement accorde RÉELLEMENT l'effet : assez de
 * pièces ET classe autorisée. Un set porté par une classe qui n'y a pas droit ne
 * donne rien → la rune, elle, doit s'appliquer (l'éveil transcende le poids).
 */
export function runeEffectSuppressed(
  runeSetId: string | null | undefined,
  equippedSetIds: (string | null | undefined)[],
  classId?: string | null,
): boolean {
  const s = setById(runeSetId ?? undefined);
  if (!s) return false;
  const worn = equippedSetIds.filter((id) => id === s.id).length;
  return worn >= setEffectAt(s) && classCanUseSet(s, classId);
}

/**
 * Capacités réellement accordées par la rune, compte tenu de l'équipement porté.
 * À utiliser PARTOUT à la place de `runeAbilities` quand on construit un
 * combattant : c'est le seul point qui empêche le double effet.
 */
export function runeAbilitiesFor(
  runeSetId: string | null | undefined,
  equippedSetIds: (string | null | undefined)[],
  classId?: string | null,
): Ability[] {
  return runeEffectSuppressed(runeSetId, equippedSetIds, classId) ? [] : runeAbilities(runeSetId);
}
