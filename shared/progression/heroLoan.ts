/**
 * Prêt de héros : fige un héros en SNAPSHOT lecture seule pour qu'un emprunteur
 * puisse l'utiliser sans jamais toucher au héros du propriétaire.
 *
 * Choix clé : le snapshot est EXACTEMENT un `CombatantInput` — la structure que
 * le moteur de combat (`resolveCombat`) attend déjà pour un héros normal. Un seul
 * chemin de code : héros normal et héros emprunté produisent le même type.
 * Pur et testable, partagé front + Edge Functions.
 */
import type { Ability, CombatantInput, CombatPassive, DamageTag } from '../combat/types.ts';
import { effectiveStats } from './formulas.ts';
import {
  computeAbilities,
  computePassives,
  combatRole,
  classHealMult,
  type LearnedSkills,
  type SkillLoadout,
} from './skills.ts';
import { computeSetAbilities } from './sets.ts';
import { classDamageBase } from './damageTypes.ts';
import { baseIdOfName, weaponTypeBonus, blessedTypeBonusPct } from './blessing.ts';
import { runeAbilities } from './runes.ts';
import { NO_COMBAT_BUFF, type GuildCombatBuff } from './guildSkills.ts';

/**
 * Amplificateur de combat porté par l'ARME équipée : son `typeBonus`
 * (physique/magique → `dmgAmp` ; soin → abilité `heal_amp`), amplifié par le
 * niveau de bénédiction. C'est le point où les types de dégât d'arme (bloc 1) et
 * la bénédiction (bloc 5) prennent enfin effet en combat.
 */
export function weaponCombatAmp(weapon?: { name: string; blessingLevel: number } | null): {
  dmgAmp?: Partial<Record<DamageTag, number>>;
  healAbilities: Ability[];
} {
  if (!weapon) return { healAbilities: [] };
  const baseId = baseIdOfName(weapon.name);
  const tb = baseId ? weaponTypeBonus(baseId) : null;
  if (!tb) return { healAbilities: [] };
  const pct = blessedTypeBonusPct(tb.pct, weapon.blessingLevel ?? 0);
  if (pct <= 0) return { healAbilities: [] };
  if (tb.kind === 'heal') return { healAbilities: [{ kind: 'heal_amp', bonus: pct }] };
  return { dmgAmp: { [tb.kind]: pct }, healAbilities: [] };
}

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
  /** Arme équipée (nom → modèle/typeBonus, niveau de bénédiction) — pour l'amplificateur de type. */
  weapon?: { name: string; blessingLevel: number } | null;
  /**
   * Passif de l'ARME équipée (valeur DÉJÀ en fraction) : stat secondaire des
   * modèles qui en portent une (Arc → crit, Dague → esquive). Même véhicule que
   * `jewelPassive` — jusqu'ici seul le bijou pouvait en porter un.
   */
  weaponPassive?: CombatPassive | null;
  /**
   * Passif de la RELIQUE équipée (valeur DÉJÀ en fraction). Une relique normale
   * n'en porte pas ; le véhicule existe pour de futurs objets. Cf. `armorPassive`.
   */
  relicPassive?: CombatPassive | null;
  /**
   * Passif de l'ARMURE équipée (valeur DÉJÀ en fraction) : normalement une armure
   * ne porte que des stats brutes, mais l'ARMURE DIVINE (Forge Sacrée) embarque
   * l'effet d'une gemme. Même véhicule que `jewelPassive`.
   */
  armorPassive?: CombatPassive | null;
  /** set_id de la rune équipée (héros éveillé) → accorde l'effet 2-pièces de ce set. */
  runeSetId?: string | null;
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
 * Passif de combat porté par une ligne `items` (bijou OU arme) : `passive_value`
 * est stocké en % ENTIERS en base, le combat attend une fraction.
 * Chaque fonction Edge refaisait ce mapping à la main — une seule source ici.
 */
export function itemCombatPassive(
  item?: { passive_type?: string | null; passive_value?: number | null } | null,
): CombatPassive | null {
  if (!item?.passive_type || (item.passive_value ?? 0) <= 0) return null;
  return { type: item.passive_type as CombatPassive['type'], value: (item.passive_value ?? 0) / 100 };
}

/**
 * Passifs d'ÉQUIPEMENT retenus pour le combat : un même type ne compte QU'UNE
 * FOIS, la source la plus forte l'emporte.
 *
 * Le combat additionne les passifs (`passive()` dans resolveCombat) : sans ce
 * filtre, une arme Divine et un bijou portant la même gemme cumulaient leurs
 * pourcentages — 35 % + 35 % de vol de vie. Les gemmes ont un PLAFOND par
 * gemme (`maxPct`) précisément pour borner ces effets ; les empiler sur quatre
 * emplacements faisait sauter ce plafond ×4 et rendait la Forge Sacrée
 * obligatoire pour tout le monde.
 *
 * « Le plus fort gagne » plutôt que « le premier gagne » : équiper un objet ne
 * doit jamais AFFAIBLIR un héros, sinon le joueur doit deviner l'ordre des
 * emplacements.
 *
 * ⚠️ La règle porte sur l'ÉQUIPEMENT seul. Les passifs d'ARBRE et le buff de
 * guilde continuent de s'ajouter : ce sont d'autres axes de progression, et le
 * crit reste de toute façon borné par `CRIT_CHANCE_CAP`.
 */
export function equipmentPassives(
  sources: (CombatPassive | null | undefined)[],
): CombatPassive[] {
  const best = new Map<CombatPassive['type'], CombatPassive>();
  for (const p of sources) {
    if (!p) continue;
    const kept = best.get(p.type);
    if (!kept || p.value > kept.value) best.set(p.type, p);
  }
  return [...best.values()];
}

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
    ...equipmentPassives([h.jewelPassive, h.weaponPassive, h.relicPassive, h.armorPassive]),
    ...computePassives(h.classId, h.skills, h.loadout),
    ...(buff.critChance > 0 ? [{ type: 'crit' as const, value: buff.critChance }] : []),
  ];
  const wAmp = weaponCombatAmp(h.weapon);
  return {
    id: h.id,
    name: h.name,
    role: combatRole(h.classId),
    basicType: classDamageBase(h.classId),
    healMult: classHealMult(h.classId),
    ...buffed,
    ...(buff.critDmg > 0 ? { critDmg: buff.critDmg } : {}),
    ...(wAmp.dmgAmp ? { dmgAmp: wAmp.dmgAmp } : {}),
    passives,
    abilities: [
      ...computeAbilities(h.classId, h.skills, h.loadout),
      ...computeSetAbilities(h.setIds ?? [], h.classId),
      ...runeAbilities(h.runeSetId),
      ...wAmp.healAbilities,
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
