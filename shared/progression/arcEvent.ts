/**
 * Event de boss d'arc COMMUNAUTAIRE (« La Cloche du Désespoir »), Phase 3.
 * Constantes + helpers partagés front + Edge Function. Voir `docs/arc-system.md`.
 */
import type { CombatantInput } from '../combat/types.ts';

/** Joueurs ayant fini la carte du monde requis pour SONNER la cloche (invoquer). */
export const ARC_EVENT_BELL_THRESHOLD = 5;

/**
 * PV du boss ajoutés par joueur ÉLIGIBLE (figé à l'invocation). Le boss a donc
 * `hp = ARC_EVENT_HP_PER_PARTICIPANT × éligibles`. C'est le knob principal, mais
 * peu risqué : le KILL GARANTI (échéance) ouvre l'arc même si le pool n'est pas vidé.
 */
export const ARC_EVENT_HP_PER_PARTICIPANT = 40_000_000;

/** Fenêtre de l'event : au-delà, kill GARANTI (l'arc s'ouvre quoi qu'il arrive). */
export const ARC_EVENT_WINDOW_DAYS = 3;

export const ARC_BOSS_NAME = 'La Cloche du Désespoir';

/** PV du sac de frappe (le combat ne le TUE jamais : il mesure la contribution). */
const ARC_BOSS_FIGHT_HP = 1_000_000_000;
const ARC_BOSS_FIGHT_ATK = 700;
const ARC_BOSS_FIGHT_DEF = 90;

/** PV du POOL communautaire selon le nombre d'éligibles (figé à l'invocation). */
export function arcBossHp(eligibleCount: number): number {
  return ARC_EVENT_HP_PER_PARTICIPANT * Math.max(1, Math.floor(eligibleCount));
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
    abilities: [{ kind: 'immune', chance: 1, statuses: ['stun'] }],
  };
}
