/**
 * Succès + titres (V2). Chaque succès est DÉRIVÉ de l'état actuel du joueur (pas
 * d'événement à journaliser) : on calcule un instantané de stats, puis on évalue
 * quels succès sont débloqués. Chaque succès accorde un TITRE équipable (un seul
 * à la fois, stocké dans profiles.title). Pur → serveur (validation) + UI.
 */

import { MAX_MASTERY_LEVEL, AUTO_UNLOCK_LEVEL } from './mastery.ts';

/** Instantané des stats du joueur nécessaires à l'évaluation des succès. */
export type AchievementStats = {
  heroesCount: number;
  maxHeroLevel: number;
  hasSGrade: boolean;
  distinctClasses: number;
  dungeonsCleared: number;
  arenaRank: number | null;
  blessedWeapons: number;
  maxUpgrade: number;
  itemsCount: number;
  pantinBest: number;
  maxDifficulty: number;
  /** Niveaux des trois maîtrises d'atelier (1..MAX_MASTERY_LEVEL). */
  forgeLevel: number;
  jewelLevel: number;
  relicLevel: number;
  /** Meilleur étage franchi à la Tour (0 = jamais grimpé). */
  towerBestFloor: number;
  /** Un héros porte-t-il ses QUATRE pièces en composant de zone 10 ? */
  fullZone10Hero: boolean;
};

export type AchievementCategory = 'progression' | 'collection' | 'pvp' | 'maitrise';

export type Achievement = {
  id: string;
  name: string;
  desc: string;
  category: AchievementCategory;
  /** Titre débloqué par ce succès. */
  title: string;
  /** Condition de déblocage sur l'instantané de stats. */
  test: (s: AchievementStats) => boolean;
};

/** Seuil de score « Pantin » pour le succès du cogneur. */
export const PANTIN_ACHIEVEMENT_SCORE = 1_000_000;

/**
 * Étages de la Tour qui valent un titre : la moitié, puis le sommet.
 *
 * `TOWER_SUMMIT_FLOOR` duplique `TOWER_MAX_FLOOR` (tower.ts) au lieu de
 * l'importer : tower.ts tire tout le moteur de combat derrière lui, et la
 * fonction `titles` n'a aucune raison de l'embarquer pour lire un entier.
 * `achievements.test.ts` verrouille l'égalité des deux — le test, lui, peut
 * importer ce qu'il veut.
 */
export const TOWER_HALFWAY_FLOOR = 50;
export const TOWER_SUMMIT_FLOOR = 100;

/** Catalogue des succès (ordre = affichage). */
export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_hero', name: 'Premiers pas', desc: 'Recrute ton premier héros.', category: 'progression', title: 'Novice',
    test: (s) => s.heroesCount >= 1 },
  { id: 'full_roster', name: 'Effectif complet', desc: 'Atteins 9 héros dans ton vivier.', category: 'collection', title: 'Capitaine',
    test: (s) => s.heroesCount >= 9 },
  { id: 's_grade', name: 'Élu du destin', desc: 'Possède un héros de grade S.', category: 'collection', title: 'l’Élu',
    test: (s) => s.hasSGrade },
  { id: 'all_classes', name: 'Panthéon', desc: 'Possède au moins un héros de chaque classe.', category: 'collection', title: 'Maître d’armes',
    test: (s) => s.distinctClasses >= 8 },
  { id: 'max_level', name: 'Apogée', desc: 'Monte un héros au niveau maximum (40).', category: 'progression', title: 'Vétéran',
    test: (s) => s.maxHeroLevel >= 40 },
  { id: 'all_dungeons', name: 'Briseur de donjons', desc: 'Termine les 4 donjons.', category: 'progression', title: 'Briseur de donjons',
    test: (s) => s.dungeonsCleared >= 4 },
  { id: 'arena_top', name: 'Sommet de l’arène', desc: 'Atteins la 1re place de l’arène.', category: 'pvp', title: 'Gladiateur',
    test: (s) => s.arenaRank === 1 },
  { id: 'blessed', name: 'Sanctification', desc: 'Bénis une arme.', category: 'maitrise', title: 'le Sanctifié',
    test: (s) => s.blessedWeapons >= 1 },
  { id: 'forge_master', name: 'Maître forgeron', desc: 'Amène un objet au renforcement +10.', category: 'maitrise', title: 'Maître forgeron',
    test: (s) => s.maxUpgrade >= 10 },
  { id: 'collector', name: 'Amasseur', desc: 'Possède 50 objets.', category: 'collection', title: 'Amasseur',
    test: (s) => s.itemsCount >= 50 },
  { id: 'pantin_crusher', name: 'Cogneur', desc: `Dépasse ${PANTIN_ACHIEVEMENT_SCORE.toLocaleString('fr-FR')} au Pantin.`, category: 'maitrise', title: 'Bourreau',
    test: (s) => s.pantinBest >= PANTIN_ACHIEVEMENT_SCORE },
  { id: 'conqueror', name: 'Conquérant', desc: 'Atteins la difficulté 30.', category: 'progression', title: 'Conquérant',
    test: (s) => s.maxDifficulty >= 30 },

  /* ---------------------------------------------------------- ATELIERS ----
   * Les trois maîtrises se jouaient sans aucune reconnaissance : monter la
   * forge au niveau max ne laissait aucune trace. L'échelle suit les jalons
   * qui se RESSENTENT déjà en jeu — le palier d'auto (Nv.8), le plafond
   * (Nv.20) — plutôt que des chiffres ronds arbitraires.
   */
  { id: 'first_auto', name: 'Compagnon', desc: `Amène un atelier à la maîtrise Nv.${AUTO_UNLOCK_LEVEL} — le palier où l’automatisation se débloque.`, category: 'maitrise', title: 'Compagnon',
    test: (s) => Math.max(s.forgeLevel, s.jewelLevel, s.relicLevel) >= AUTO_UNLOCK_LEVEL },
  { id: 'forge_mastery', name: 'Grand Forgeron', desc: `Maîtrise de forge au niveau ${MAX_MASTERY_LEVEL}.`, category: 'maitrise', title: 'Grand Forgeron',
    test: (s) => s.forgeLevel >= MAX_MASTERY_LEVEL },
  { id: 'jewel_mastery', name: 'Grand Joaillier', desc: `Maîtrise de joaillerie au niveau ${MAX_MASTERY_LEVEL}.`, category: 'maitrise', title: 'Grand Joaillier',
    test: (s) => s.jewelLevel >= MAX_MASTERY_LEVEL },
  { id: 'relic_mastery', name: 'Gardien des Reliques', desc: `Maîtrise de reliquaire au niveau ${MAX_MASTERY_LEVEL}.`, category: 'maitrise', title: 'Gardien des Reliques',
    test: (s) => s.relicLevel >= MAX_MASTERY_LEVEL },
  { id: 'all_masteries', name: 'Grand Artisan', desc: `Les TROIS ateliers au niveau ${MAX_MASTERY_LEVEL}.`, category: 'maitrise', title: 'Grand Artisan',
    test: (s) => Math.min(s.forgeLevel, s.jewelLevel, s.relicLevel) >= MAX_MASTERY_LEVEL },

  /* -------------------------------------------------------------- TOUR ---- */
  { id: 'tower_halfway', name: 'Grimpeur', desc: `Atteins l’étage ${TOWER_HALFWAY_FLOOR} de la Tour.`, category: 'progression', title: 'Grimpeur',
    test: (s) => s.towerBestFloor >= TOWER_HALFWAY_FLOOR },
  { id: 'tower_summit', name: 'Sommet de la Tour', desc: `Franchis l’étage ${TOWER_SUMMIT_FLOOR} — le dernier.`, category: 'progression', title: 'Seigneur de la Tour',
    test: (s) => s.towerBestFloor >= TOWER_SUMMIT_FLOOR },

  /* -------------------------------------------------------- PANOPLIE ----
   * Équiper UN héros de quatre pièces de zone 10, c'est le bout de la chaîne
   * de craft : farm zone 10 + boss + donjon + joaillerie. Un seul succès
   * récompense donc les trois ateliers À LA FOIS.
   */
  { id: 'zone10_full', name: 'Paré d’étoiles', desc: 'Équipe un héros de 4 pièces en composant de zone 10 (arme, armure, bijou, relique).', category: 'collection', title: 'Paré d’étoiles',
    test: (s) => s.fullZone10Hero },
];

/** Ids des succès débloqués pour un instantané de stats. */
export function unlockedAchievements(stats: AchievementStats): string[] {
  return ACHIEVEMENTS.filter((a) => a.test(stats)).map((a) => a.id);
}

export function achievementById(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

/** Le titre `title` est-il légitimement débloqué par les stats ? (validation serveur.) */
export function titleUnlocked(title: string, stats: AchievementStats): boolean {
  return ACHIEVEMENTS.some((a) => a.title === title && a.test(stats));
}
