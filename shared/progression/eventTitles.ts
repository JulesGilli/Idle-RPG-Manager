/**
 * TITRES D'ÉVÉNEMENT — les titres qui accordent des STATS, par opposition aux
 * titres de succès (`achievements.ts`) qui sont purement honorifiques.
 *
 * Un titre d'event est décerné par une activité (aujourd'hui : le 1er du
 * classement hebdomadaire du Boss de la Semaine), vit dans `player_event_titles`
 * avec un `stat_mult` et une date d'expiration, et son porteur en tire un bonus
 * RÉEL en combat tant qu'il l'a équipé.
 *
 * Ce module est le point unique qui traduit `stat_mult` en bonus de combat, pour
 * que l'affichage (« +5 % ATK ») et le moteur ne puissent jamais diverger.
 * Pur et partagé front + Edge Functions.
 */
import type { GuildCombatBuff } from './guildSkills.ts';

/** Une ligne `player_event_titles` encore valide. */
export type EventTitle = {
  title: string;
  /** Multiplicateur de stat (1.05 = +5 %). */
  statMult: number;
  /** ISO — au-delà, le titre ne donne plus rien et ne peut plus être équipé. */
  expiresAt: string;
};

/**
 * Bonus d'ATTAQUE accordé par un titre, en FRACTION (0.05 = +5 %). C'est la
 * seule lecture de `stat_mult` autorisée : tout le reste (UI, combat) passe par
 * ici. Un multiplicateur absent ou ≤ 1 ne donne rien.
 */
export function titleAtkBonus(statMult: number | null | undefined): number {
  const m = typeof statMult === 'number' ? statMult : 1;
  return m > 1 ? m - 1 : 0;
}

/** Le titre accorde-t-il des stats ? (sert à le distinguer visuellement.) */
export function titleGivesStats(statMult: number | null | undefined): boolean {
  return titleAtkBonus(statMult) > 0;
}

/** Libellé court du bonus, pour l'afficher à côté du titre (« +5 % ATK »). */
export function titleStatLabel(statMult: number | null | undefined): string | null {
  const bonus = titleAtkBonus(statMult);
  return bonus > 0 ? `+${Math.round(bonus * 100)} % ATK` : null;
}

/** Le titre est-il encore valide à l'instant `nowMs` ? */
export function isTitleActive(expiresAt: string | null | undefined, nowMs: number): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) && t > nowMs;
}

/**
 * Fusionne le bonus d'un titre dans le buff de combat du joueur (celui de la
 * guilde). C'est le VÉHICULE choisi pour appliquer le titre en combat : toutes
 * les activités construisent déjà leur escouade avec ce buff, donc le titre
 * s'applique partout sans toucher au moteur ni aux 11 fonctions une par une.
 *
 * Le bonus s'ADDITIONNE à celui de la guilde (deux sources distinctes de +ATK),
 * comme le fait déjà `combatBuff` entre ses propres nœuds.
 */
export function withTitleBuff(
  buff: GuildCombatBuff,
  statMult: number | null | undefined,
): GuildCombatBuff {
  const bonus = titleAtkBonus(statMult);
  return bonus > 0 ? { ...buff, atk: buff.atk + bonus } : buff;
}
