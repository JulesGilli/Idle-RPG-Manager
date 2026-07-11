/**
 * BANC DE TEST D'EQUILIBRAGE — tous les reglages ("knobs") au meme endroit.
 *
 * C'est LE fichier a editer pour ajuster ce que le simulateur teste, sans
 * toucher au code des runners. Chaque combat rejoue le VRAI moteur du jeu
 * (`resolveCombat`), donc les resultats refletent exactement la prod.
 */
import type { Rarity } from '../shared/progression/loot.ts';

/** Les 5 classes du jeu. */
export const CLASSES = ['guerrier', 'paladin', 'archer', 'mage', 'soigneur'] as const;
export type ClassId = (typeof CLASSES)[number];

/** Composition d'escouade "type" testee sur les zones : une de chaque classe. */
export const SQUAD_COMP: ClassId[] = ['paladin', 'guerrier', 'soigneur', 'archer', 'mage'];

/**
 * Profils de stuff. Pour une zone-cible Z, on equipe le heros avec le materiau
 * de forge d'une zone (`matZoneOffset` par rapport a Z) et une rarete donnee.
 * - under : joueur qui rush, sous-equipe (materiau zone precedente, rarete basse).
 * - on    : stuff "attendu" pile pour la zone.
 * - over  : joueur qui farm avant d'avancer (rarete max).
 */
export type GearProfile = {
  id: 'under' | 'on' | 'over';
  label: string;
  matZoneOffset: number; // decalage de la zone du materiau vs la zone-cible
  rarity: Rarity;
  upgradeLevel: number; // niveau d'amelioration forge applique (0-10)
};

export const GEAR_PROFILES: GearProfile[] = [
  { id: 'under', label: 'Sous-equipe', matZoneOffset: -1, rarity: 'common', upgradeLevel: 0 },
  { id: 'on', label: 'Calibre', matZoneOffset: 0, rarity: 'uncommon', upgradeLevel: 2 },
  { id: 'over', label: 'Sur-equipe', matZoneOffset: 0, rarity: 'ultimate', upgradeLevel: 5 },
];

/**
 * Niveau de heros "attendu" quand un joueur arrive sur la zone Z (1..10).
 * Cap du jeu = 30. C'est un knob : ajuste si ta courbe de progression reelle
 * differe. Le stuff (profil) est la variable principale ; le niveau suit la zone.
 */
export const LEVEL_FOR_ZONE: number[] = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30];

export function levelForZone(zone: number): number {
  return LEVEL_FOR_ZONE[Math.max(0, Math.min(9, zone - 1))]!;
}

/**
 * Roll de naissance moyen (bonus_hp/atk/def/speed). 0 = heros "neutre" pour un
 * test deterministe et comparable. Mets des valeurs si tu veux simuler un roll type.
 */
export const BIRTH_BONUS = { hp: 0, atk: 0, def: 0, speed: 0 };

/**
 * Nombre de seeds (combats independants) par scenario. Plus = stats plus lisses,
 * mais plus lent. 40 donne un taux de victoire fiable a ~2-3 % pres.
 */
export const SEEDS_PER_SCENARIO = 40;

/** Seed de base ; les seeds effectives sont BASE_SEED + i. Deterministe. */
export const BASE_SEED = 0x5eed;

/**
 * Cibles d'equilibrage (pour le verdict automatique du rapport). Taux de
 * victoire attendu du profil "on" (calibre) sur les niveaux normaux et boss.
 */
export const BALANCE_TARGETS = {
  onNormalMinWin: 0.9, // un joueur calibre doit rouler sur les niveaux normaux
  onBossMinWin: 0.55, // le boss doit etre gagnable mais couter
  onBossMaxWin: 0.95, // ... sans etre trivial
  underShouldStruggleBossMaxWin: 0.5, // sous-equipe doit galerer sur le boss
};
