/**
 * Progression de COMPTE (méta-progression du joueur, distincte des héros).
 *
 * - Le joueur gagne de l'XP de compte égale à `ACCOUNT_XP_SHARE` (10 %) de l'XP
 *   totale gagnée par ses héros, quelle qu'en soit la source (assaut, expédition…).
 * - Le niveau de compte débloque progressivement les activités du jeu.
 * - Au tout début, seules la Carte et l'Escouade sont disponibles.
 *
 * Pur et partagé front + Edge Function. Aucune I/O.
 */

/** Part de l'XP des héros reversée au compte du joueur. */
export const ACCOUNT_XP_SHARE = 0.1;

/** Convertit un gain d'XP héros (total, tous héros) en gain d'XP de compte. */
export function accountXpFromHeroXp(totalHeroXpGained: number): number {
  return Math.floor(Math.max(0, totalHeroXpGained) * ACCOUNT_XP_SHARE);
}

/** Coût en XP pour passer de `level` à `level + 1` (croissance composée). */
export function accountXpToNext(level: number): number {
  return Math.round(50 * level * Math.pow(1.4, level - 1));
}

export type AccountProgress = {
  level: number;
  /** XP accumulée dans le niveau courant. */
  xpInLevel: number;
  /** XP nécessaire pour finir le niveau courant. */
  xpForLevel: number;
};

/** Niveau + progression à partir de l'XP de compte totale. */
export function accountProgress(totalXp: number): AccountProgress {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalXp));
  while (remaining >= accountXpToNext(level)) {
    remaining -= accountXpToNext(level);
    level += 1;
  }
  return { level, xpInLevel: remaining, xpForLevel: accountXpToNext(level) };
}

/** Niveau de compte à partir de l'XP totale. */
export function accountLevel(totalXp: number): number {
  return accountProgress(totalXp).level;
}

/**
 * Activités gâtables. `maps` (Carte) et `squad` (Escouade) sont TOUJOURS
 * disponibles et ne figurent donc pas ici.
 */
export type ActivityKey =
  | 'inventory'
  | 'village'
  | 'forge'
  | 'tavern'
  | 'library'
  | 'encyclopedia'
  | 'jewelry'
  | 'relic'
  | 'dungeon'
  | 'arc_boss'
  | 'expedition'
  | 'guild';

/**
 * Niveau de compte requis pour débloquer chaque activité.
 * `inventory` (le Sac) fait exception : il se débloque au PREMIER matériau ramassé,
 * pas à un niveau — cette valeur ne sert que de repère d'affichage (voir useUnlocks).
 * Onboarding guidé : au niveau 3 on n'ouvre QUE le village + la taverne (recrutement) ;
 * la forge et le reste arrivent ensuite.
 */
export const ACTIVITY_UNLOCKS: Record<ActivityKey, number> = {
  inventory: 2,
  village: 3,
  tavern: 3,
  library: 2,
  encyclopedia: 2,
  forge: 5,
  dungeon: 6,
  jewelry: 7,
  arc_boss: 8,
  relic: 8,
  expedition: 9,
  guild: 11,
};

/** Une activité est-elle débloquée à ce niveau de compte ? */
export function isActivityUnlocked(activity: ActivityKey, level: number): boolean {
  return level >= ACTIVITY_UNLOCKS[activity];
}

/** Libellé « progression » du niveau de compte (rang du commandant). */
export function accountTitle(level: number): string {
  if (level >= 30) return 'Légende';
  if (level >= 24) return 'Suzerain';
  if (level >= 18) return 'Seigneur de guerre';
  if (level >= 14) return 'Champion';
  if (level >= 10) return 'Vétéran';
  if (level >= 7) return 'Capitaine';
  if (level >= 5) return 'Aventurier';
  if (level >= 3) return 'Recrue';
  return 'Novice';
}
