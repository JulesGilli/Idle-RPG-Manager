/**
 * Codes de redeem : des codes secrets (créés par l'admin) qu'un joueur saisit une
 * fois pour recevoir une récompense EXCLUSIVE. Un code peut être limité en nombre
 * d'usages et/ou expirer. Un joueur ne peut réclamer un code donné qu'une seule fois.
 *
 * Pur et partagé front + Edge Functions (aucune I/O).
 */

/** Récompense d'un code : or + matériaux + éventuel objet ultime de zone 10. */
export type RedeemReward = {
  gold?: number;
  materials?: { key: string; qty: number }[];
  /** true = accorde un objet ultime de zone 10 (forgé rareté ultime, comme le jour 10). */
  item?: boolean;
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
  if (r.item) parts.push('objet ultime de zone 10');
  return parts;
}
