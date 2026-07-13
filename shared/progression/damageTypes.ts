/**
 * Type de dégâts de BASE par classe (physique / magique). Sert de base aux
 * amplificateurs de type (sets +physique / +magique / +feu…). Mapping V1.1,
 * volontairement simple et tunable. Les ÉCOLES (feu/poison/arcane) ne sont pas
 * ici : elles sont déduites en combat des effets du skill/statut (feu = burn,
 * poison = poison, arcane = marque arcane).
 */
import type { DamageBase } from '../combat/types.ts';

export const CLASS_DAMAGE_BASE: Record<string, DamageBase> = {
  guerrier: 'physical',
  archer: 'physical',
  paladin: 'physical',
  mage: 'magical',
  soigneur: 'magical',
  // V2 — nouvelles classes (cf. docs/refonte-v2.md §8-9).
  voleur: 'physical', // dague, dégâts physiques
  necromancien: 'magical', // faux, dégâts magiques
  inquisiteur: 'physical', // grande épée physique ; les éléments (feu/foudre/givre) = écoles via skills
};

/** Base de dégâts d'une classe (défaut 'physical' si inconnue). */
export function classDamageBase(classId: string): DamageBase {
  return CLASS_DAMAGE_BASE[classId] ?? 'physical';
}
