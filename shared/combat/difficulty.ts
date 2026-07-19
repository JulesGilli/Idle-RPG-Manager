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
import type { Ability, AutocastAction, CombatantInput } from './types.ts';

/** Multiplicateurs de stats appliqués à un ennemi. */
export type MonsterScaling = { hp: number; atk: number; def: number };

/**
 * Multiplicateurs appliqués aux monstres classiques (mobs normaux) — DONJONS.
 * Ajuster ici pour recalibrer globalement la difficulté des combats de donjon.
 */
export const NORMAL_MONSTER_SCALING: MonsterScaling = {
  hp: 2.1,
  atk: 1.6,
  def: 1.5,
};

/**
 * Multiplicateurs des mobs normaux de la CARTE DU MONDE (distinct des donjons).
 * Refonte : monstres beaucoup plus CORIACES (PV) mais qui frappent moins fort
 * (fini le one-shot) → les combats de carte deviennent des vraies batailles
 * d'usure plutôt que du « rocket-tag ». Seul knob à toucher pour recalibrer.
 */
export const MAP_MONSTER_SCALING: MonsterScaling = {
  hp: 6,
  atk: 0.85,
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

/** Renforce un monstre classique de DONJON : plus de PV, d'ATK et de DEF. */
export function scaleNormalMonster(m: CombatantInput): CombatantInput {
  return scaleMonster(m, NORMAL_MONSTER_SCALING);
}

/** Renforce un mob normal de la CARTE (PV++, ATK−). */
export function scaleMapMonster(m: CombatantInput): CombatantInput {
  return scaleMonster(m, MAP_MONSTER_SCALING);
}

/**
 * Rampe de dégâts selon la PROGRESSION (difficulté du niveau). Les ennemis frappent
 * de plus en plus fort à mesure qu'on avance — SANS toucher le début du jeu (les
 * nouveaux joueurs ne doivent pas être bloqués). Neutre (×1) jusqu'à la difficulté
 * `DAMAGE_RAMP_START`, puis +`DAMAGE_RAMP_PER_STEP` par palier de difficulté au-delà.
 * Difficulté d'un boss de zone ≈ zone × 5 (z1 boss = 5, z7 = 35, z10 = 50).
 * Ex. : z1-2 = ×1 (intact), z7 ≈ ×2.0, z10 ≈ ×2.6. Seuls knobs à re-tuner.
 */
export const DAMAGE_RAMP_START = 10;
export const DAMAGE_RAMP_PER_STEP = 0.04;
export function progressiveDamageMult(difficulty: number): number {
  return 1 + Math.max(0, difficulty - DAMAGE_RAMP_START) * DAMAGE_RAMP_PER_STEP;
}

/**
 * Rampe de dégâts des DONJONS, calée sur le `tier` (échelle propre, 1..N — distincte
 * de la difficulté de carte). Le **tier 1 reste INTACT** (bon pour débuter) ; les
 * tiers supérieurs frappent de plus en plus fort (ils étaient trop faciles).
 *
 * Passage de 4 à 8 donjons : la rampe est ÉTIRÉE, pas prolongée. L'ancien T4
 * (×2.5, le plus dur du jeu) devient le nouveau T8 — donc `1 + 7·r = 2.5`, soit
 * r = 1.5/7. Garder r = 0.5 aurait porté le T8 à ×4.5, c'est-à-dire créé quatre
 * paliers plus durs que tout ce qui existait, au lieu d'en intercaler quatre.
 * ×1 (T1) · ×1.21 (T2) · ×1.43 (T3) · ×1.64 (T4) · ×1.86 (T5) · ×2.07 (T6) ·
 * ×2.29 (T7) · ×2.5 (T8).
 */
export const DUNGEON_DAMAGE_RAMP_PER_TIER = 1.5 / 7;
export function dungeonDamageMult(tier: number): number {
  return 1 + Math.max(0, Math.round(tier) - 1) * DUNGEON_DAMAGE_RAMP_PER_TIER;
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

/* ------------------------------------------------------- BOSS DE CARTE -- */

/**
 * Refonte des boss de carte : ils ne doivent plus « one-shot toute l'équipe » ni
 * « mourir en 2-3 tours ». On relève fortement leurs PV, on baisse fortement leur
 * ATK de base (attaques normales survivables), et la PRESSION vient d'une ATTAQUE
 * SPÉCIALE distincte par zone (autocast périodique). Seuls knobs à toucher.
 */
export const MAP_BOSS_HP_MULT = 1.8;
export const MAP_BOSS_ATK_MULT = 0.55;

type BossSpecial = { everyRounds: number; action: AutocastAction };

/**
 * Une attaque spéciale par zone (index 0 = zone 1 … 9 = zone 10). Archétypes variés :
 * frappe unique brutale, poison de zone, geôlier (étourdit les plus faibles),
 * perce-armure en % de PV (anti-tank), rafale multi-cibles, jugement céleste.
 */
const MAP_BOSS_SPECIALS: BossSpecial[] = [
  // z1 — Brute : concentre un coup dévastateur sur la cible la plus faible.
  { everyRounds: 4, action: { type: 'nuke', dmgMult: 2.4 } },
  // z2 — Venimeux : empoisonne toute l'équipe.
  { everyRounds: 3, action: { type: 'aoe', dmgMult: 0.7, status: 'poison', statusChance: 1, statusPotency: 0.12, statusDuration: 3 } },
  // z3 — Geôlier : étourdit les 2 alliés les plus bas en PV.
  { everyRounds: 4, action: { type: 'stun_lowest', count: 2, duration: 1, dmgMult: 0.6 } },
  // z4 — Fléau : poison renforcé sur toute l'équipe.
  { everyRounds: 3, action: { type: 'aoe', dmgMult: 0.8, status: 'poison', statusChance: 1, statusPotency: 0.16, statusDuration: 3 } },
  // z5 — Perce-armure : dégâts en % des PV max (plafonnés, anti-tank / anti-one-shot).
  { everyRounds: 4, action: { type: 'pct_hp', pct: 0.22, capMult: 3 } },
  // z6 — Colosse : frappe brutale qui affaiblit aussi la cible.
  { everyRounds: 4, action: { type: 'nuke', dmgMult: 2.6, status: 'weaken', statusPotency: 0.2, statusDuration: 2 } },
  // z7 — Gardien : étourdit longuement (2 tours) les 2 plus faibles.
  { everyRounds: 4, action: { type: 'stun_lowest', count: 2, duration: 2, dmgMult: 0.8 } },
  // z8 — Tempête : rafale qui frappe toute l'équipe 2 fois.
  { everyRounds: 4, action: { type: 'multi_hit', hits: 2, dmgMult: 0.6 } },
  // z9 — Pestilence : poison massif + dégâts sur toute l'équipe.
  { everyRounds: 3, action: { type: 'aoe', dmgMult: 1.0, status: 'poison', statusChance: 1, statusPotency: 0.2, statusDuration: 3 } },
  // z10 — Jugement céleste : foudroie ET étourdit toute l'équipe.
  { everyRounds: 5, action: { type: 'stun_all', duration: 1, dmgMult: 1.2 } },
];

/** Zone (1..10) d'un boss de carte, dérivée de sa difficulté (boss ≈ zone × 5). */
function bossZone(difficulty: number): number {
  return Math.max(1, Math.min(MAP_BOSS_SPECIALS.length, Math.round(difficulty / 5)));
}

/**
 * Renforce un BOSS de carte : PV ×{@link MAP_BOSS_HP_MULT}, ATK ×{@link MAP_BOSS_ATK_MULT},
 * immunité au stun, et son attaque spéciale de zone (remplace l'ancienne abilité
 * uniforme). Pur, ne mute pas l'entrée.
 */
export function tuneMapBoss(m: CombatantInput, difficulty: number): CombatantInput {
  const special = MAP_BOSS_SPECIALS[bossZone(difficulty) - 1]!;
  const tuned: CombatantInput = {
    ...m,
    hp: Math.max(1, Math.round(m.hp * MAP_BOSS_HP_MULT)),
    atk: Math.max(1, Math.round(m.atk * MAP_BOSS_ATK_MULT)),
    abilities: [{ kind: 'autocast', everyRounds: special.everyRounds, action: special.action }],
  };
  return withStunImmunity(tuned);
}
