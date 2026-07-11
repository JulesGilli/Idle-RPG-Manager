/**
 * Construction d'un heros de test = miroir fidele de `buildAllies` (serveur,
 * resolve-deployment/index.ts). Base de classe -> effectiveStats(niveau) ->
 * bonus d'equipement (forge reelle) -> sets -> skills -> basicType.
 *
 * Le stuff est genere via les VRAIES formules de forge (`craftItemAtRarity`,
 * `rollBonuses`, `effectiveBonus`) pour rester realiste : un heros simule a le
 * meme profil de stats qu'un vrai heros equipe a la forge.
 */
import type { CombatantInput } from '../shared/combat/types.ts';
import { effectiveStats } from '../shared/progression/formulas.ts';
import { combatRole, computeAbilities, computePassives } from '../shared/progression/skills.ts';
import { computeSetAbilities, computeSetBonuses } from '../shared/progression/sets.ts';
import { classDamageBase } from '../shared/progression/damageTypes.ts';
import { rollBonuses, RARITY_MULT, type Rarity } from '../shared/progression/loot.ts';
import {
  FORGE_BASES,
  FORGE_MATERIALS,
  craftItemAtRarity,
  effectiveBonus,
  type ForgeBase,
} from '../shared/progression/forge.ts';
import type { HeroClass } from './loadData.ts';
import { BIRTH_BONUS, levelForZone, type ClassId, type GearProfile } from './config.ts';

type Bonuses = { atk: number; def: number; hp: number };

/** Modele d'arme/armure de forge choisi par classe (poids equipable). */
const CLASS_FORGE: Record<ClassId, { weapon: string; armor: string }> = {
  paladin: { weapon: 'grande_epee', armor: 'plaques' }, // heavy
  guerrier: { weapon: 'grande_epee', armor: 'plaques' }, // heavy
  archer: { weapon: 'arc', armor: 'mailles' }, // medium
  mage: { weapon: 'sceptre', armor: 'tunique' }, // light
  soigneur: { weapon: 'sceptre', armor: 'tunique' }, // light
};

function baseById(id: string): ForgeBase {
  const b = FORGE_BASES.find((x) => x.id === id);
  if (!b) throw new Error(`Forge base introuvable: ${id}`);
  return b;
}

/** Materiau de forge d'une zone (1..10), borne. */
function materialForZone(zone: number) {
  const z = Math.max(1, Math.min(FORGE_MATERIALS.length, zone));
  return FORGE_MATERIALS.find((m) => m.zone === z)!;
}

/** Bonus additionnes des 4 pieces d'equipement pour (classe, zone, profil). */
export function gearBonuses(
  classId: ClassId,
  targetZone: number,
  profile: GearProfile,
): Bonuses {
  const matZone = targetZone + profile.matZoneOffset;
  const mat = materialForZone(matZone);
  const rarity: Rarity = profile.rarity;
  const up = profile.upgradeLevel;
  const forge = CLASS_FORGE[classId];

  // Arme + armure : craft reel (biais du modele + theme du materiau + rarete).
  const weapon = craftItemAtRarity(baseById(forge.weapon), mat, rarity);
  const armor = craftItemAtRarity(baseById(forge.armor), mat, rarity);

  // Bijou + relique : universels, generes via rollBonuses a la meme echelle que
  // la forge (magnitude * 1.5), rarete appliquee. Refletent des drops calibres.
  const scale = mat.magnitude * 1.5;
  const jewel = rollBonuses('jewel', scale, RARITY_MULT[rarity]);
  const relic = rollBonuses('relic', scale, RARITY_MULT[rarity]);

  const pieces = [weapon, armor, jewel, relic];
  const sum = (k: 'atk_bonus' | 'def_bonus' | 'hp_bonus') =>
    pieces.reduce((s, p) => s + effectiveBonus(p[k] ?? 0, up), 0);

  return { atk: sum('atk_bonus'), def: sum('def_bonus'), hp: sum('hp_bonus') };
}

export type BuildOpts = {
  /** Niveau force (sinon deduit de la zone via LEVEL_FOR_ZONE). */
  level?: number;
  /** Competences apprises (defaut : aucune — test de base brut). */
  learned?: Record<string, number>;
  /** Loadout actif/ultime (defaut : aucun). */
  loadout?: { activeId: string | null; ultimateId: string | null };
  /** Ids de sets equipes (defaut : aucun). */
  setIds?: (string | null)[];
  /**
   * Bonus d'equipement force (atk/def/hp). Si fourni, remplace le calcul forge
   * (`gearBonuses`) — utilise pour les builds a SETS (stats des pieces de set).
   */
  gearOverride?: Bonuses;
  /** Suffixe d'id/nom pour distinguer plusieurs heros de meme classe. */
  tag?: string;
};

/** Construit un CombatantInput pret au combat pour (classe, zone, profil). */
export function buildHero(
  cls: HeroClass,
  classId: ClassId,
  targetZone: number,
  profile: GearProfile,
  opts: BuildOpts = {},
): CombatantInput {
  const level = opts.level ?? levelForZone(targetZone);
  const learned = opts.learned ?? {};
  const loadout = opts.loadout ?? { activeId: null, ultimateId: null };
  const setIds = opts.setIds ?? [];

  const gear = opts.gearOverride ?? gearBonuses(classId, targetZone, profile);
  const setB = computeSetBonuses(setIds, classId);

  const stats = effectiveStats(
    {
      hp: Math.max(1, cls.base_hp + BIRTH_BONUS.hp),
      atk: Math.max(1, cls.base_atk + BIRTH_BONUS.atk),
      def: Math.max(0, cls.base_def + BIRTH_BONUS.def),
      speed: Math.max(1, cls.base_speed + BIRTH_BONUS.speed),
    },
    level,
    { atk: gear.atk + setB.atk, def: gear.def + setB.def, hp: gear.hp + setB.hp },
  );

  const role = combatRole(classId);
  const abilities = [
    ...computeAbilities(classId, learned, loadout),
    ...computeSetAbilities(setIds, classId),
  ];
  const passives = computePassives(classId, learned, loadout);

  const id = `${classId}${opts.tag ? '-' + opts.tag : ''}`;
  return {
    id,
    name: `${cls.name}${opts.tag ? ' ' + opts.tag : ''}`,
    role,
    basicType: classDamageBase(classId),
    ...stats,
    passives,
    abilities,
  };
}
