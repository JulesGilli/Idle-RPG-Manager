/**
 * Arbre de compétences de GUILDE (logique pure, partagée front + Edge Functions).
 *
 * Deux monnaies de points, toutes deux DÉRIVÉES (jamais stockées) :
 * - Points de raid : 1 par niveau de raid battu (`highest_raid_cleared`). Dépensés
 *   sur les stats de BASE (atk/hp/def/xp/gold), chacune 3 paliers de +5% (max +15%).
 * - Points de niveau : 1 par niveau de guilde. Dépensés sur les stats AVANCÉES
 *   (crit_chance/crit_dmg…), +1% par point (max 10).
 *
 * Les buffs de stats (atk/hp/def + crit) s'appliquent aux héros des membres dans
 * tous les combats SAUF l'arène ; les buffs de gains (xp/gold) à leurs récoltes.
 * Seule la répartition (`GuildAlloc`) est persistée (colonne jsonb `skill_alloc`).
 */
import type { CombatantInput } from '../combat/types.ts';

/* ------------------------------------------------------------- STATS ------ */

export const BASE_STATS = ['atk', 'hp', 'def', 'xp', 'gold'] as const;
export type BaseStat = (typeof BASE_STATS)[number];
export const BASE_MAX_RANK = 3;
export const BASE_STEP = 0.05; // +5% par palier

export const ADV_STATS = ['crit_chance', 'crit_dmg'] as const;
export type AdvStat = (typeof ADV_STATS)[number];
export const ADV_MAX_RANK = 10;
export const ADV_STEP = 0.01; // +1% par point

export type GuildStat = BaseStat | AdvStat;
export type GuildAlloc = Partial<Record<GuildStat, number>>;

export const GUILD_STAT_META: Record<GuildStat, { label: string; kind: 'base' | 'adv' }> = {
  atk: { label: 'Attaque', kind: 'base' },
  hp: { label: 'Points de vie', kind: 'base' },
  def: { label: 'Armure', kind: 'base' },
  xp: { label: "Gain d'XP", kind: 'base' },
  gold: { label: "Gain d'or", kind: 'base' },
  crit_chance: { label: 'Chance de critique', kind: 'adv' },
  crit_dmg: { label: 'Dégâts critiques', kind: 'adv' },
};

export function isBaseStat(stat: GuildStat): stat is BaseStat {
  return (BASE_STATS as readonly string[]).includes(stat);
}
export function maxRank(stat: GuildStat): number {
  return isBaseStat(stat) ? BASE_MAX_RANK : ADV_MAX_RANK;
}
export function stepOf(stat: GuildStat): number {
  return isBaseStat(stat) ? BASE_STEP : ADV_STEP;
}
export function rankOf(alloc: GuildAlloc, stat: GuildStat): number {
  return Math.max(0, Math.min(maxRank(stat), Math.floor(alloc[stat] ?? 0)));
}

/* ------------------------------------------------------------- RAIDS ------ */

export const MAX_RAID_LEVEL = 10;
/** Renfort des ennemis par niveau de raid : +45% (additif) → niveau 10 ≈ ×5. */
export const RAID_DIFFICULTY_STEP = 0.45;

export function raidDifficultyMult(level: number): number {
  const l = Math.max(1, Math.min(MAX_RAID_LEVEL, Math.floor(level)));
  return 1 + RAID_DIFFICULTY_STEP * (l - 1);
}

/** Niveau de raid à jouer = juste au-dessus du plus haut battu (plafonné à 10). */
export function nextRaidLevel(highestCleared: number): number {
  return Math.min(MAX_RAID_LEVEL, Math.max(0, Math.floor(highestCleared)) + 1);
}

/* ------------------------------------------------------------ POINTS ------ */

export function baseSpent(alloc: GuildAlloc): number {
  return BASE_STATS.reduce((s, st) => s + rankOf(alloc, st), 0);
}
export function advSpent(alloc: GuildAlloc): number {
  return ADV_STATS.reduce((s, st) => s + rankOf(alloc, st), 0);
}

/** Points de raid disponibles = niveaux de raid battus − points de base dépensés. */
export function raidPointsAvailable(highestCleared: number, alloc: GuildAlloc): number {
  return Math.max(0, Math.floor(highestCleared) - baseSpent(alloc));
}
/** Points de niveau disponibles = niveau de guilde − points avancés dépensés. */
export function levelPointsAvailable(guildLevel: number, alloc: GuildAlloc): number {
  return Math.max(0, Math.floor(guildLevel) - advSpent(alloc));
}

/** Peut-on monter d'un rang cette stat ? (cap non atteint ET point dispo) */
export function canSpend(
  stat: GuildStat,
  alloc: GuildAlloc,
  highestCleared: number,
  guildLevel: number,
): boolean {
  if (rankOf(alloc, stat) >= maxRank(stat)) return false;
  return isBaseStat(stat)
    ? raidPointsAvailable(highestCleared, alloc) > 0
    : levelPointsAvailable(guildLevel, alloc) > 0;
}

/* ------------------------------------------------------------- BUFFS ------ */

/** Buff de combat (fractions) appliqué aux héros des membres — hors arène. */
export type GuildCombatBuff = {
  atk: number;
  def: number;
  hp: number;
  critChance: number;
  critDmg: number;
};

export function combatBuff(alloc: GuildAlloc): GuildCombatBuff {
  return {
    atk: rankOf(alloc, 'atk') * BASE_STEP,
    def: rankOf(alloc, 'def') * BASE_STEP,
    hp: rankOf(alloc, 'hp') * BASE_STEP,
    critChance: rankOf(alloc, 'crit_chance') * ADV_STEP,
    critDmg: rankOf(alloc, 'crit_dmg') * ADV_STEP,
  };
}

/** Buff de gains (fractions) : +xp / +gold sur les récoltes des membres. */
export function gainBuff(alloc: GuildAlloc): { xp: number; gold: number } {
  return {
    xp: rankOf(alloc, 'xp') * BASE_STEP,
    gold: rankOf(alloc, 'gold') * BASE_STEP,
  };
}

/** Buff neutre (aucune guilde / aucune allocation). */
export const NO_COMBAT_BUFF: GuildCombatBuff = {
  atk: 0,
  def: 0,
  hp: 0,
  critChance: 0,
  critDmg: 0,
};

/** Aucune stat allouée ? (permet de court-circuiter l'application du buff). */
export function isNeutralBuff(b: GuildCombatBuff): boolean {
  return b.atk === 0 && b.def === 0 && b.hp === 0 && b.critChance === 0 && b.critDmg === 0;
}

/**
 * Applique un buff de guilde à un combattant DÉJÀ construit (CombatantInput) :
 * multiplie atk/def/hp, ajoute la chance de crit en passif, cumule le crit-dmg.
 * Utilisé par les edge functions qui ne passent pas par `buildHeroSnapshot`
 * (déploiement, donjon, tour, boss d'arc). Ne mute pas l'entrée.
 */
export function applyCombatBuff(c: CombatantInput, buff: GuildCombatBuff): CombatantInput {
  if (isNeutralBuff(buff)) return c;
  const passives =
    buff.critChance > 0
      ? [...(c.passives ?? []), { type: 'crit' as const, value: buff.critChance }]
      : c.passives;
  return {
    ...c,
    atk: Math.round(c.atk * (1 + buff.atk)),
    def: Math.round(c.def * (1 + buff.def)),
    hp: Math.round(c.hp * (1 + buff.hp)),
    ...(c.startHp != null ? { startHp: Math.round(c.startHp * (1 + buff.hp)) } : {}),
    ...(buff.critDmg > 0 ? { critDmg: (c.critDmg ?? 0) + buff.critDmg } : {}),
    ...(passives ? { passives } : {}),
  };
}
