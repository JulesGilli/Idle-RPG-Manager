/**
 * Event de boss d'arc COMMUNAUTAIRE (« La Cloche du Désespoir »), Phase 3.
 * Constantes + helpers partagés front + Edge Function. Voir `docs/arc-system.md`.
 */
import type { CombatantInput } from '../combat/types.ts';

/** Joueurs ayant fini la carte du monde requis pour SONNER la cloche (invoquer). */
export const ARC_EVENT_BELL_THRESHOLD = 5;

/**
 * PV du boss ajoutés par joueur ÉLIGIBLE (figé à l'APPARITION du boss, fin de la
 * préparation — cf. `advanceEvent`). Le boss a donc `hp = ARC_EVENT_HP_PER_PARTICIPANT
 * × éligibles`. C'est le knob principal, mais peu risqué : le KILL GARANTI (échéance)
 * ouvre l'arc même si le pool n'est pas vidé.
 */
export const ARC_EVENT_HP_PER_PARTICIPANT = 1_600_000; // 8 M pour 5 joueurs éligibles

/** Préparation : délai entre la cloche et l'APPARITION du boss (« en approche »). */
export const ARC_EVENT_PREP_HOURS = 24;

/** Cooldown entre deux frappes d'UN MÊME joueur (heures). */
export const ARC_EVENT_HIT_COOLDOWN_HOURS = 3;

/**
 * Fenêtre de COMBAT après l'invocation (jours). Passé ce délai sans le tuer, le
 * boss SE RETIRE (pas de kill garanti) : l'arc ne s'ouvre QUE si on le tue ; sinon
 * on re-sonne la cloche.
 */
export const ARC_EVENT_FIGHT_WINDOW_DAYS = 3;

export const ARC_BOSS_NAME = 'La Cloche du Désespoir';

/** PV du sac de frappe (le combat ne le TUE jamais : il mesure la contribution). */
const ARC_BOSS_FIGHT_HP = 1_000_000_000;
/** ATK de départ + rampe : le boss commence FAIBLE puis devient létal (+10 %/tour). */
const ARC_BOSS_FIGHT_ATK = 100;
const ARC_BOSS_FIGHT_ATK_RAMP = 0.1;
const ARC_BOSS_FIGHT_DEF = 90;

/* Spéciales du boss (une spéciale REMPLACE l'attaque de base ce tour-là) :
 * - Glas funèbre : AoE à 80 % de l'ATK toutes les 3 manches, avec une chance
 *   d'AFFAIBLIR chaque cible (ATK/DEF réduites) — le debuff demandé, qui use
 *   l'escouade sans la one-shot.
 * - Marteau du Désespoir : frappe ciblée à 200 % sur la cible la plus basse
 *   toutes les 5 manches.
 * Périodes 3 et 5 : elles ne tombent ensemble qu'à la manche 15, quand la rampe
 * d'ATK rend de toute façon le combat terminal. */
const ARC_BOSS_AOE_EVERY = 3;
const ARC_BOSS_AOE_MULT = 0.8;
const ARC_BOSS_AOE_WEAKEN_CHANCE = 0.35;
const ARC_BOSS_AOE_WEAKEN_POTENCY = 0.2; // −20 % ATK & DEF
const ARC_BOSS_AOE_WEAKEN_DURATION = 2;
const ARC_BOSS_NUKE_EVERY = 5;
const ARC_BOSS_NUKE_MULT = 2.0;

/** PV du POOL communautaire selon le nombre d'éligibles (figé à l'invocation). */
export function arcBossHp(eligibleCount: number): number {
  return ARC_EVENT_HP_PER_PARTICIPANT * Math.max(1, Math.floor(eligibleCount));
}

/* ------------------------------------------------------------------ PHASE 2 *
 * LES CŒURS DE DÉMON.
 *
 * Le pool de la phase 1 vidé, l'Être tombe mais ne meurt pas : il dévoile ses
 * cinq cœurs. C'est un SECOND pool, sur la même ligne `arc_events` (colonne
 * `phase`), qu'il faut vider à son tour pour ouvrir l'arc. Rater cette phase =
 * le boss s'échappe, exactement comme une fenêtre de combat expirée.
 */

/** Cœurs révélés à la chute du boss. */
export const ARC_HEART_COUNT = 5;

/** PV d'UN cœur, par joueur éligible (le pool total vaut ×ARC_HEART_COUNT). */
export const ARC_HEART_HP_PER_PARTICIPANT = 1_000_000;

/** PV d'un seul cœur. */
export function arcHeartHp(eligibleCount: number): number {
  return ARC_HEART_HP_PER_PARTICIPANT * Math.max(1, Math.floor(eligibleCount));
}

/** PV du pool de la phase 2 (les cinq cœurs réunis). */
export function arcHeartsPoolHp(eligibleCount: number): number {
  return arcHeartHp(eligibleCount) * ARC_HEART_COUNT;
}

/** PV du sac de frappe d'UN cœur (jamais tué en un combat : il MESURE les dégâts). */
const ARC_HEART_FIGHT_HP = 1_000_000_000;

/**
 * Les cœurs tels qu'AFFRONTÉS : les CINQ ensemble, à chaque frappe.
 *
 * C'est tout l'intérêt de la phase : cinq cibles simultanées récompensent les
 * builds à dégâts de ZONE, qui les touchent toutes d'un coup là où un build
 * mono-cible n'en entame qu'une. On ne retire donc jamais un cœur du combat,
 * même quand le pool commun a déjà bien fondu.
 *
 * `inert` (et non `atk: 0`) parce que le moteur plancher chaque coup à 1 dégât :
 * à zéro d'attaque, cinq cœurs useraient quand même l'escouade. Ils sont aussi
 * insensibles au stun — étourdir une chose qui ne joue pas serait un gaspillage
 * de compétence déguisé en effet utile.
 */
export function arcHeartCombatants(): CombatantInput[] {
  return Array.from({ length: ARC_HEART_COUNT }, (_, i) => ({
    id: `arc-heart-${i + 1}`,
    name: `Cœur de démon ${i + 1}`,
    role: 'enemy' as const,
    hp: ARC_HEART_FIGHT_HP,
    atk: 0,
    def: 0,
    speed: 1,
    abilities: [{ kind: 'inert' as const }, { kind: 'immune' as const, chance: 1, statuses: ['stun' as const] }],
  }));
}

/**
 * Le boss tel qu'affronté à CHAQUE frappe : un « sac de frappe » à PV énormes
 * (jamais tué en un combat). La CONTRIBUTION = dégâts infligés = `hp - PV finaux`.
 * Insensible au stun. Frappe fort pour que la contribution dépende de la puissance
 * réelle de l'escouade (une équipe faible se fait laver et contribue moins).
 */
export function arcBossFightCombatant(): CombatantInput {
  return {
    id: 'arc-boss',
    name: ARC_BOSS_NAME,
    role: 'enemy',
    hp: ARC_BOSS_FIGHT_HP,
    atk: ARC_BOSS_FIGHT_ATK,
    def: ARC_BOSS_FIGHT_DEF,
    speed: 8,
    abilities: [
      { kind: 'immune', chance: 1, statuses: ['stun'] },
      // Enrage propre : +10 %/tour de dégâts → il devient létal, la contribution
      // récompense la DURABILITÉ de l'escouade (elle tape jusqu'à se faire laver).
      { kind: 'atk_ramp', perTurn: ARC_BOSS_FIGHT_ATK_RAMP },
      {
        kind: 'autocast',
        everyRounds: ARC_BOSS_AOE_EVERY,
        action: {
          type: 'aoe',
          dmgMult: ARC_BOSS_AOE_MULT,
          status: 'weaken',
          statusChance: ARC_BOSS_AOE_WEAKEN_CHANCE,
          statusPotency: ARC_BOSS_AOE_WEAKEN_POTENCY,
          statusDuration: ARC_BOSS_AOE_WEAKEN_DURATION,
        },
      },
      {
        kind: 'autocast',
        everyRounds: ARC_BOSS_NUKE_EVERY,
        action: { type: 'nuke', dmgMult: ARC_BOSS_NUKE_MULT },
      },
    ],
  };
}
