/**
 * Codes de redeem : des codes secrets (créés par l'admin) qu'un joueur saisit une
 * fois pour recevoir une récompense EXCLUSIVE. Un code peut être limité en nombre
 * d'usages et/ou expirer. Un joueur ne peut réclamer un code donné qu'une seule fois.
 *
 * Pur et partagé front + Edge Functions (aucune I/O).
 */

import type { Rarity } from './loot.ts';

/** Spéc d'un objet offert : composant de zone (id forge) + rareté (+ modèle optionnel). */
export type RedeemItemSpec = { material_id: string; rarity?: Rarity; base_id?: string };

/** Récompense d'un code : or + matériaux + éventuel objet forgé. */
export type RedeemReward = {
  gold?: number;
  materials?: { key: string; qty: number }[];
  /**
   * Objet offert. `true` = objet ultime de zone 10 (legacy) ; un objet `{material_id,
   * rarity?, base_id?}` = objet forgé sur mesure (ex. zone 1 en rareté ultime).
   */
  item?: boolean | RedeemItemSpec;
};

/** Normalise un code saisi : majuscules, sans espaces ni tirets superflus. */
export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/[\s-]+/g, '');
}

/** Un code est-il valide en la forme ? (3–24 caractères alphanumériques). */
export function isValidCodeFormat(code: string): boolean {
  return /^[A-Z0-9]{3,24}$/.test(code);
}

/** Résumé lisible d'une récompense (front). */
export function describeReward(r: RedeemReward): string[] {
  const parts: string[] = [];
  if (r.gold && r.gold > 0) parts.push(`${r.gold} or`);
  for (const m of r.materials ?? []) if (m.qty > 0) parts.push(`${m.qty}× ${m.key}`);
  if (r.item === true) parts.push('objet ultime de zone 10');
  else if (r.item) parts.push(`objet ${r.item.rarity ?? 'ultime'}`);
  return parts;
}
