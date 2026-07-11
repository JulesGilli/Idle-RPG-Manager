/**
 * Garnison de guilde : entraide entre membres.
 *
 * Un membre dépose au plus `GARRISON_SLOTS_PER_PLAYER` héros dans la garnison de
 * sa guilde. Les AUTRES membres peuvent en emprunter au plus
 * `BORROW_LIMIT_PER_TEAM` par équipe (un renfort, pas un carry), uniquement pour
 * la Carte (déploiement/farm) et les Donjons.
 *
 * Le héros emprunté est utilisé via un SNAPSHOT figé (un `CombatantInput`, cf.
 * `heroLoan.buildHeroSnapshot`) — le héros du propriétaire n'est jamais bloqué ni
 * modifié, et il reste pleinement utilisable par lui.
 *
 * Pur, sans I/O — partagé front + Edge Functions.
 */

/** Nombre de héros qu'un membre peut déposer en garnison simultanément. */
export const GARRISON_SLOTS_PER_PLAYER = 1;

/** Nombre de héros empruntés autorisés dans une même équipe (sur 5). */
export const BORROW_LIMIT_PER_TEAM = 1;

/**
 * Bridage anti-carry d'un héros EMPRUNTÉ (pour l'emprunteur, réinitialisé chaque
 * jour civil Europe/Paris). Sans ça, un renfort surpuissant porterait tout.
 */
/** Donjons : un héros emprunté ne peut servir qu'une fois par jour. */
export const BORROW_DUNGEON_PER_DAY = 1;
/** Carte : un héros emprunté ne peut enchaîner que 5 combats par jour. */
export const BORROW_MAP_FIGHTS_PER_DAY = 5;

/** Activités où l'emprunt de garnison est autorisé. */
export type GarrisonActivity = 'deployment' | 'dungeon';
