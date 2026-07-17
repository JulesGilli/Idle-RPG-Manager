/**
 * Convention d'id des INVOCATIONS (squelettes du Nécromancien, etc.).
 *
 * Une invocation reçoit un id `<summonerId>~summon~<nom>~<k>` : il ENCODE son
 * invocateur. Ça permet, sans champ supplémentaire sur `CombatantFinalState`, de
 * (1) rattacher visuellement l'invocation à son invocateur dans l'arène et
 * (2) réattribuer ses dégâts infligés/subis à l'invocateur dans le récap.
 */
export const SUMMON_SEP = '~summon~';

/** Id d'une invocation `k` de `summonName` appartenant à `summonerId`. */
export function summonId(summonerId: string, summonName: string, k: number): string {
  return `${summonerId}${SUMMON_SEP}${summonName}~${k}`;
}

/** Cet id est-il celui d'une invocation ? */
export function isSummonId(id: string): boolean {
  return id.includes(SUMMON_SEP);
}

/** Id de l'invocateur d'une invocation (l'id lui-même si ce n'en est pas une). */
export function summonerIdOf(id: string): string {
  const i = id.indexOf(SUMMON_SEP);
  return i === -1 ? id : id.slice(0, i);
}
