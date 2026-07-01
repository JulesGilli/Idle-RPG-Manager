/**
 * PRNG déterministe (mulberry32). Même seed → même séquence.
 * Permet de rejouer/déboguer un combat et d'écrire des tests déterministes.
 * Pur, sans dépendance runtime (importable côté Vite ET côté Deno).
 */
export type Rng = {
  /** Flottant dans [0, 1). */
  next(): number;
  /** Entier dans [min, max] inclus. */
  int(min: number, max: number): number;
  /** Facteur de variance dans [1 - spread, 1 + spread). */
  variance(spread: number): number;
};

export function createRng(seed: number): Rng {
  let a = seed >>> 0;

  const next = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    variance: (spread) => 1 - spread + next() * (2 * spread),
  };
}
