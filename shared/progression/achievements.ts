/**
 * Succès + titres (V2). Chaque succès est DÉRIVÉ de l'état actuel du joueur (pas
 * d'événement à journaliser) : on calcule un instantané de stats, puis on évalue
 * quels succès sont débloqués. Chaque succès accorde un TITRE équipable (un seul
 * à la fois, stocké dans profiles.title). Pur → serveur (validation) + UI.
 */

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
