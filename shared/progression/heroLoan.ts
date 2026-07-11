/**
 * Prêt de héros : fige un héros en SNAPSHOT lecture seule pour qu'un emprunteur
 * puisse l'utiliser sans jamais toucher au héros du propriétaire.
 *
 * Choix clé : le snapshot est EXACTEMENT un `CombatantInput` — la structure que
 * le moteur de combat (`resolveCombat`) attend déjà pour un héros normal. Un seul
 * chemin de code : héros normal et héros emprunté produisent le même type.
 * Pur et testable, partagé front + Edge Functions.
 */
import type { CombatantInput, CombatPassive } from '../combat/types.ts';
import { effectiveStats } from './formulas.ts';
import { computeAbilities, computePassives, combatRole, type LearnedSkills, type SkillLoadout } from './skills.ts';
import { computeSetAbilities } from './sets.ts';
import { classDamageBase } from './damageTypes.ts';
import { NO_COMBAT_BUFF, type GuildCombatBuff } from './guildSkills.ts';

/** Ingrédients bruts d'un héros nécessaires pour reconstruire ses stats de combat. */
export type HeroSnapshotInput = {
  id: string;
  name: string;
  classId: string;
  level: number;
  /** Stats de base de la classe (hero_classes). */
  classBase: { hp: number; atk: number; def: number; speed: number };
  /** Roll de naissance (heroes.bonus_*). */
  innate: { hp: number; atk: number; def: number; speed: number };
  /** Points de stat alloués (heroes.alloc_*). */
  alloc: { hp: number; atk: number; def: number; speed: number };
  /** Somme des bonus d'équipement (arme + armure + bijou + relique). */
  equipment: { atk: number; def: number; hp: number };
  /** Passif du bijou équipé (valeur DÉJÀ en fraction), s'il y en a un. */
  jewelPassive?: CombatPassive | null;
  /** Compétences apprises (nodeId -> rang). */
  skills: LearnedSkills;
  /** Actif + ultime équipés (un seul de chaque appliqué en combat). */
  loadout?: SkillLoadout;
  /** set_ids équipés (arme/armure/bijou/relique) → effets de set complet (≥4 pièces). */
  setIds?: (string | null | undefined)[];
};

/**
 * Un snapshot de héros = un `CombatantInput`. On alias le type pour l'intention,
 * mais c'est bien la MÊME structure que pour un héros normal (pas de type parallèle).
 */
export type HeroSnapshot = CombatantInput;

/**
 * Fige un héros en `CombatantInput` prêt pour `resolveCombat` (mêmes règles que le
 * build normal). `buff` = bonus de guilde (fractions) appliqués aux stats de combat
 * et au crit ; absent/neutre = héros non buffé (arène, aperçu front…).
 */
export function buildHeroSnapshot(
  h: HeroSnapshotInput,
  buff: GuildCombatBuff = NO_COMBAT_BUFF,
): HeroSnapshot {
  const stats = effectiveStats(
    {
      hp: Math.max(1, h.classBase.hp + h.innate.hp),
      atk: Math.max(1, h.classBase.atk + h.innate.atk),
      def: Math.max(0, h.classBase.def + h.innate.def),
      speed: Math.max(1, h.classBase.speed + h.innate.speed),
    },
    h.level,
    { atk: h.equipment.atk, def: h.equipment.def, hp: h.equipment.hp },
    { hp: h.alloc.hp, atk: h.alloc.atk, def: h.alloc.def, speed: h.alloc.speed },
  );
  // Buff de guilde : multiplie atk/def/hp ; crit-chance ajouté comme passif, crit-dmg
  // porté par le champ dédié. `speed` n'est pas buffé (pas de stat de guilde vitesse).
  const buffed = {
    ...stats,
    atk: Math.round(stats.atk * (1 + buff.atk)),
    def: Math.round(stats.def * (1 + buff.def)),
    hp: Math.round(stats.hp * (1 + buff.hp)),
  };
  const passives: CombatPassive[] = [
    ...(h.jewelPassive ? [h.jewelPassive] : []),
    ...computePassives(h.classId, h.skills, h.loadout),
    ...(buff.critChance > 0 ? [{ type: 'crit' as const, value: buff.critChance }] : []),
  ];
  return {
    id: h.id,
    name: h.name,
    role: combatRole(h.classId),
    basicType: classDamageBase(h.classId),
    ...buffed,
    ...(buff.critDmg > 0 ? { critDmg: buff.critDmg } : {}),
    passives,
    abilities: [
      ...computeAbilities(h.classId, h.skills, h.loadout),
      ...computeSetAbilities(h.setIds ?? [], h.classId),
    ],
  };
}

/**
 * Un héros n'est empruntable que s'il n'est pas déjà engagé dans une activité
 * chez son propriétaire (déploiement/farm, donjon, expédition, ou déjà prêté).
 * L'ensemble des héros engagés est calculé côté serveur (état DB) et fourni ici.
 */
export function isHeroAvailableForLoan(heroId: string, engagedHeroIds: readonly string[]): boolean {
  return !engagedHeroIds.includes(heroId);
}
