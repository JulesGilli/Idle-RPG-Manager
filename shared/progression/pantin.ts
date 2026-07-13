/**
 * Activité journalière — le Pantin d'entraînement.
 *
 * Un mannequin qui ne riposte JAMAIS (attaque 0) et dont les PV sont hors d'atteinte
 * en 50 tours : l'équipe tape dessus pendant `PANTIN_ROUNDS` tours, et le SCORE =
 * total des dégâts infligés. Faisable 1×/jour. Récompense = or proportionnel au
 * score (borné). Pur → réutilisé côté serveur (calcul) et UI (aperçu/affichage).
 */
import type { CombatantFinalState, CombatantInput } from '../combat/types.ts';

/** Nombre de tours du combat d'entraînement. */
export const PANTIN_ROUNDS = 50;

/** PV du pantin : volontairement gigantesques → il ne meurt jamais en 50 tours,
 *  donc le score (dégâts infligés) n'est pas plafonné par sa mort. */
export const PANTIN_HP = 1_000_000_000_000;

/** Le combattant « pantin » : encaisse tout, ne rend rien. */
export function buildPantin(): CombatantInput {
  return {
    id: 'pantin',
    name: "Pantin d'entraînement",
    role: 'enemy',
    hp: PANTIN_HP,
    atk: 0,
    def: 0,
    speed: 1,
  };
}

/**
 * Score = dégâts totaux infligés au pantin, lu depuis l'état final du combat.
 * On calcule `maxHp − hp` (et non `PANTIN_HP − hp`) car le moteur applique un
 * facteur d'échelle aux PV : `maxHp` est la seule référence fiable.
 */
export function pantinScore(finalState: CombatantFinalState[]): number {
  const p = finalState.find((c) => c.id === 'pantin');
  return p ? Math.max(0, p.maxHp - p.hp) : 0;
}

/**
 * Récompense en or pour un score (total de dégâts infligés). Croît avec le score
 * mais bornée pour ne pas casser l'économie ; un plancher garantit un gain minimal.
 */
export const PANTIN_GOLD_MIN = 500;
export const PANTIN_GOLD_MAX = 30_000;
export const PANTIN_GOLD_PER_DMG = 0.01;

export function pantinReward(score: number): { gold: number } {
  const raw = Math.round(Math.max(0, score) * PANTIN_GOLD_PER_DMG);
  return { gold: Math.max(PANTIN_GOLD_MIN, Math.min(PANTIN_GOLD_MAX, raw)) };
}
