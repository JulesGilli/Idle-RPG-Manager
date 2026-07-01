/**
 * Formules d'accumulation idle (expéditions). Pures et testables.
 * L'accumulation dépend uniquement du temps écoulé et de la difficulté,
 * ce qui la rend calculable de façon déterministe côté serveur.
 */

/** Une "aventure" symbolique toutes les N secondes (pour le feed narratif). */
export const ADVENTURE_SECONDS = 60;

/** Plafond hors-ligne : au-delà, l'accumulation s'arrête (8 h). */
export const OFFLINE_CAP_SECONDS = 8 * 3600;

export type ExpeditionRates = {
  goldPerMin: number;
  /** XP par minute, appliquée à CHAQUE héros de l'expédition. */
  xpPerMinPerHero: number;
};

export function expeditionRates(difficulty: number): ExpeditionRates {
  return {
    goldPerMin: 2 * difficulty,
    xpPerMinPerHero: 1.5 * difficulty,
  };
}

export type Accrual = {
  /** Secondes réellement prises en compte (plafonnées). */
  effectiveSeconds: number;
  adventures: number;
  gold: number;
  /** XP à appliquer à chaque héros assigné. */
  xpPerHero: number;
  /** Nombre de tirages de loot à effectuer. */
  lootRolls: number;
  /** true si le temps écoulé a dépassé le plafond hors-ligne. */
  capped: boolean;
};

/** Calcule l'accumulation pour `elapsedSeconds` écoulées à une difficulté donnée. */
export function computeAccrual(difficulty: number, elapsedSeconds: number): Accrual {
  const clamped = Math.max(0, elapsedSeconds);
  const effectiveSeconds = Math.min(clamped, OFFLINE_CAP_SECONDS);
  const minutes = effectiveSeconds / 60;
  const rates = expeditionRates(difficulty);
  const adventures = Math.floor(effectiveSeconds / ADVENTURE_SECONDS);

  return {
    effectiveSeconds,
    adventures,
    gold: Math.floor(minutes * rates.goldPerMin),
    xpPerHero: Math.floor(minutes * rates.xpPerMinPerHero),
    lootRolls: Math.min(Math.floor(adventures / 20), 8),
    capped: clamped > OFFLINE_CAP_SECONDS,
  };
}
