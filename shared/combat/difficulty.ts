/**
 * Réglages de difficulté des ENNEMIS, partagés front + Edge Functions.
 *
 * Deux règles, appliquées au moment où l'on construit les combattants ennemis :
 *  1. Les monstres « classiques » (mobs normaux, hors mini-boss et boss) sont
 *     renforcés (PV / ATK / DEF) — les combats de progression étaient trop faciles.
 *  2. Les boss sont insensibles à l'étourdissement (stun) : on ne peut pas les
 *     bloquer en boucle. Leurs stats restent inchangées (déjà équilibrées).
 *
 * Primitives PURES : pas d'I/O, ne mutent pas leurs entrées (renvoient une copie).
 */
import type { Ability, CombatantInput } from './types.ts';

/** Multiplicateurs de stats appliqués à un ennemi. */
export type MonsterScaling = { hp: number; atk: number; def: number };

/**
 * Multiplicateurs appliqués aux monstres classiques (mobs normaux).
 * Ajuster ici pour recalibrer globalement la difficulté des combats de base.
 */
export const NORMAL_MONSTER_SCALING: MonsterScaling = {
  hp: 2.1,
  atk: 1.6,
  def: 1.5,
};

/**
 * Multiplicateurs appliqués aux mini-boss (checkpoint d'une séquence de donjon).
 * Renforcés eux aussi, mais plus légèrement : ils partent déjà d'un socle plus
 * élevé et restent en dessous du boss final.
 */
export const MINIBOSS_MONSTER_SCALING: MonsterScaling = {
  hp: 1.6,
  atk: 1.35,
  def: 1.3,
};

/** Applique un jeu de multiplicateurs à un ennemi (copie, ne mute pas l'entrée). */
function scaleMonster(m: CombatantInput, mult: MonsterScaling): CombatantInput {
  const scaled: CombatantInput = {
    ...m,
    hp: Math.max(1, Math.round(m.hp * mult.hp)),
    atk: Math.max(1, Math.round(m.atk * mult.atk)),
    def: Math.max(0, Math.round(m.def * mult.def)),
  };
  // startHp suit hp (un mob démarre plein) — jamais fourni côté ennemi
  // aujourd'hui, mais on le scale par cohérence s'il l'était un jour.
  if (m.startHp != null) {
    scaled.startHp = Math.max(1, Math.round(m.startHp * mult.hp));
  }
  return scaled;
}

/** Renforce un monstre classique : plus de PV, d'ATK et de DEF. */
export function scaleNormalMonster(m: CombatantInput): CombatantInput {
  return scaleMonster(m, NORMAL_MONSTER_SCALING);
}

/** Renforce un mini-boss (boost plus modéré que les mobs classiques). */
export function scaleMinibossMonster(m: CombatantInput): CombatantInput {
  return scaleMonster(m, MINIBOSS_MONSTER_SCALING);
}

/** Abilité rendant totalement insensible à l'étourdissement (stun). */
const STUN_IMMUNITY: Ability = { kind: 'immune', chance: 1, statuses: ['stun'] };

/** Rend un boss insensible au stun (sans dupliquer l'immunité si déjà présente). */
export function withStunImmunity(m: CombatantInput): CombatantInput {
  const abilities = m.abilities ?? [];
  const alreadyImmune = abilities.some(
    (a) =>
      a.kind === 'immune' &&
      a.chance >= 1 &&
      (a.statuses == null || a.statuses.includes('stun')),
  );
  if (alreadyImmune) return m;
  return { ...m, abilities: [...abilities, STUN_IMMUNITY] };
}
