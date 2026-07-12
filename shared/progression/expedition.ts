/**
 * EXPÉDITIONS : déploiements idle à durée fixe (plusieurs heures) qui rapportent
 * or + XP (donc XP de compte) + matériaux UNIQUES (destinés aux futurs sets).
 *
 * Modèle : on démarre une expédition (crée un run avec `ends_at`), puis on la
 * réclame une fois le temps écoulé → récompenses créditées une seule fois.
 * La durée dépend du NIVEAU MINIMUM de l'équipe engagée : une équipe plus forte
 * revient plus vite (jusqu'à 40 % de la durée de base).
 *
 * Pur et partagé front + Edge Function. Aucune I/O ni aléa implicite.
 */
import type { Rng } from '../combat/prng.ts';
import { arcTuning } from './arc.ts';

export type ExpeditionLootEntry = {
  resource: string;
  weight: number;
  min: number;
  max: number;
};

export type ExpeditionType = {
  id: string;
  name: string;
  min_level_required: number;
  /** Puissance d'équipe minimale (somme des puissances des héros) pour lancer. */
  min_power_required: number;
  duration_base_seconds: number;
  loot_table: ExpeditionLootEntry[];
};

/** Durée minimale = 40 % de la base (équipe très au-dessus du niveau requis). */
const MIN_DURATION_FACTOR = 0.4;

/**
 * Durée réelle (secondes) selon le niveau minimum de l'équipe.
 * À `min_level_required` → durée de base. Chaque niveau au-dessus retire ~5 %,
 * plancher à 40 %.
 */
export function computeExpeditionDuration(type: ExpeditionType, teamMinLevel: number): number {
  const over = Math.max(0, teamMinLevel - type.min_level_required);
  const factor = Math.max(MIN_DURATION_FACTOR, 1 - 0.05 * over);
  return Math.round(type.duration_base_seconds * factor);
}

/**
 * Rehaussement GLOBAL du seuil de puissance des expéditions : elles exigent
 * désormais ×10 la puissance d'avant (elles étaient bien trop accessibles).
 * S'applique à TOUS les arcs, en plus du scaling d'arc.
 */
export const EXPEDITION_POWER_MULT = 10;

/**
 * Puissance d'équipe minimale requise pour lancer. Base ×{@link EXPEDITION_POWER_MULT},
 * puis SCALÉE PAR ARC (New Game+) : en arc N, ×`arcTuning(N).powerReqMult`. Un arc
 * plus dur exige des escouades proportionnellement plus fortes.
 */
export function expeditionRequiredPower(type: ExpeditionType, arc = 1): number {
  return Math.round(type.min_power_required * EXPEDITION_POWER_MULT * arcTuning(arc).powerReqMult);
}

/** Nombre de tirages de butin (≈ 1 par heure de durée de base, min 1). */
export function expeditionLootRolls(type: ExpeditionType): number {
  return Math.max(1, Math.round(type.duration_base_seconds / 3600));
}

/** Or gagné : proportionnel au niveau requis et à la durée de base. */
export function expeditionGold(type: ExpeditionType): number {
  const hours = type.duration_base_seconds / 3600;
  return Math.round(type.min_level_required * 120 + hours * 90);
}

/** XP par héros : proportionnelle au niveau requis et à la durée de base. */
export function expeditionXpPerHero(type: ExpeditionType): number {
  const hours = type.duration_base_seconds / 3600;
  return Math.round(type.min_level_required * 45 + hours * 30);
}

/** Tire une ressource pondérée dans la table (null si table vide). */
function pickWeighted(table: ExpeditionLootEntry[], rng: Rng): ExpeditionLootEntry | null {
  const total = table.reduce((s, e) => s + Math.max(0, e.weight), 0);
  if (total <= 0) return null;
  let r = rng.next() * total;
  for (const e of table) {
    r -= Math.max(0, e.weight);
    if (r <= 0) return e;
  }
  return table[table.length - 1] ?? null;
}

/**
 * Tire le butin de matériaux uniques d'une expédition (déterministe pour un rng
 * donné). Renvoie une map { resource: quantité }.
 */
export function rollExpeditionLoot(type: ExpeditionType, rng: Rng): Record<string, number> {
  const out: Record<string, number> = {};
  const rolls = expeditionLootRolls(type);
  for (let i = 0; i < rolls; i++) {
    const entry = pickWeighted(type.loot_table, rng);
    if (!entry) continue;
    const amount = entry.min + Math.floor(rng.next() * (entry.max - entry.min + 1));
    if (amount > 0) out[entry.resource] = (out[entry.resource] ?? 0) + amount;
  }
  return out;
}

/** L'expédition est-elle terminée (temps écoulé) ? */
export function isExpeditionDone(endsAtMs: number, nowMs: number): boolean {
  return nowMs >= endsAtMs;
}
