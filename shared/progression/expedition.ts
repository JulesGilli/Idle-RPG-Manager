/**
 * EXPÉDITIONS : déploiements idle à durée fixe (plusieurs heures) qui rapportent
 * or + XP (donc XP de compte) + matériaux UNIQUES (destinés aux futurs sets).
 *
 * Modèle : on démarre une expédition (crée un run avec `ends_at`), puis on la
 * réclame une fois le temps écoulé → récompenses créditées une seule fois.
 * La durée dépend du NIVEAU MINIMUM de l'équipe engagée : une équipe plus forte
 * revient plus vite (jusqu'à 40 % de la durée de base).
 *
 * Pur et partagé front + Edge Function. Aucune I/O ni aléa implicite.
 */
import type { Rng } from '../combat/prng.ts';
import { arcTuning } from './arc.ts';

export type ExpeditionLootEntry = {
  resource: string;
  weight: number;
  min: number;
  max: number;
};

export type ExpeditionType = {
  id: string;
  name: string;
  min_level_required: number;
  /** Puissance d'équipe minimale (somme des puissances des héros) pour lancer. */
  min_power_required: number;
  duration_base_seconds: number;
  loot_table: ExpeditionLootEntry[];
};

/** Durée minimale = 40 % de la base (équipe très au-dessus du niveau requis). */
const MIN_DURATION_FACTOR = 0.4;

/* ------------------------------------------------------------------ *
 * NIVEAU D'EXPÉDITION (maîtrise globale du joueur)                    *
 * ------------------------------------------------------------------ *
 * Un unique niveau par joueur, alimenté par l'XP gagnée à chaque      *
 * expédition RÉCLAMÉE. Plus le niveau est haut, plus le loot est      *
 * facile : expéditions plus courtes, tirages tirés vers le haut       *
 * (ressources « assurées »), et petit boost sur les quantités.        *
 * Réglage « confortable » : effets sensibles mais l'expé reste un     *
 * investissement de temps.                                            */

/** Niveau de maîtrise maximal. */
export const MAX_EXPEDITION_LEVEL = 20;

/** XP nécessaire pour passer de `level` à `level + 1` (courbe douce, linéaire). */
function expeditionXpStep(level: number): number {
  return 100 + 60 * level;
}

export type ExpeditionLevelInfo = {
  /** Niveau courant (1..MAX). */
  level: number;
  /** XP acquise DANS le niveau courant. */
  xpInto: number;
  /** XP requise pour finir le niveau courant (0 si niveau max atteint). */
  xpForNext: number;
  /** XP totale cumulée. */
  totalXp: number;
};

/** Dérive le niveau de maîtrise (et la progression) à partir de l'XP totale. */
export function expeditionLevelInfo(totalXp: number): ExpeditionLevelInfo {
  const xp = Math.max(0, Math.floor(totalXp));
  let level = 1;
  let remaining = xp;
  while (level < MAX_EXPEDITION_LEVEL) {
    const step = expeditionXpStep(level);
    if (remaining < step) return { level, xpInto: remaining, xpForNext: step, totalXp: xp };
    remaining -= step;
    level += 1;
  }
  return { level: MAX_EXPEDITION_LEVEL, xpInto: 0, xpForNext: 0, totalXp: xp };
}

/** XP de maîtrise gagnée en réclamant une expédition (proportionnelle à sa taille). */
export function expeditionMasteryXpGain(type: ExpeditionType): number {
  const hours = type.duration_base_seconds / 3600;
  return Math.round(type.min_level_required * 8 + hours * 12);
}

export type ExpeditionMasteryBonus = {
  /** Multiplicateur de durée (≤ 1 : réduit le temps ; jusqu'à −20 % au max). */
  speedMult: number;
  /** Décalage du tirage vers le haut (0..0.30) : loot « assuré ». */
  luckBonus: number;
  /** Multiplicateur de quantité (≥ 1 : jusqu'à +25 % au max). */
  qtyMult: number;
};

/** Bonus de maîtrise pour un niveau donné (interpolation linéaire 1 → MAX). */
export function expeditionMasteryBonus(level: number): ExpeditionMasteryBonus {
  const denom = MAX_EXPEDITION_LEVEL - 1;
  const p = denom <= 0 ? 0 : Math.min(1, Math.max(0, (level - 1) / denom));
  return {
    speedMult: 1 - 0.2 * p,
    luckBonus: 0.3 * p,
    qtyMult: 1 + 0.25 * p,
  };
}

/**
 * Durée réelle (secondes) selon le niveau minimum de l'équipe ET le niveau de
 * maîtrise du joueur. À `min_level_required` → durée de base. Chaque niveau
 * d'équipe au-dessus retire ~5 % (plancher à 40 %) ; la maîtrise applique
 * ensuite jusqu'à −20 % supplémentaires.
 */
export function computeExpeditionDuration(
  type: ExpeditionType,
  teamMinLevel: number,
  masteryLevel = 1,
  /** Arbre d'expédition. Omis = comportement d'avant l'arbre, à l'identique. */
  alloc: ExpeditionAlloc = {},
): number {
  const over = Math.max(0, teamMinLevel - type.min_level_required);
  const teamFactor = Math.max(MIN_DURATION_FACTOR, 1 - 0.05 * over);
  const { speedMult } = expeditionTotalBonus(masteryLevel, alloc);
  return Math.round(type.duration_base_seconds * teamFactor * speedMult);
}

/**
 * Puissance d'équipe minimale requise pour lancer = `min_power_required` SCALÉ PAR
 * ARC (et RIEN d'autre) : en arc 1, on demande la valeur brute (ex. 1re expé =
 * 1000) ; chaque arc supérieur multiplie par `arcTuning(N).powerReqMult` (arc 2 =
 * ×10). Pas de rehaussement global : un arc plus dur exige une escouade plus forte,
 * point.
 */
export function expeditionRequiredPower(type: ExpeditionType, arc = 1): number {
  return Math.round(type.min_power_required * arcTuning(arc).powerReqMult);
}

/** Nombre de tirages de butin (≈ 1 par heure de durée de base, min 1). */
export function expeditionLootRolls(type: ExpeditionType): number {
  return Math.max(1, Math.round(type.duration_base_seconds / 3600));
}

/** Or gagné : proportionnel au niveau requis et à la durée de base. */
export function expeditionGold(type: ExpeditionType): number {
  const hours = type.duration_base_seconds / 3600;
  return Math.round(type.min_level_required * 120 + hours * 90);
}

/** XP par héros : proportionnelle au niveau requis et à la durée de base. */
export function expeditionXpPerHero(type: ExpeditionType): number {
  const hours = type.duration_base_seconds / 3600;
  return Math.round(type.min_level_required * 45 + hours * 30);
}

/** Tire une ressource pondérée dans la table (null si table vide). */
/** Table triée du plus COMMUN au plus RARE — l'ordre dont dépend le biais de chance. */
function byRarity(table: ExpeditionLootEntry[]): ExpeditionLootEntry[] {
  return [...table].sort((a, b) => b.weight - a.weight);
}

/** L'entrée la plus rare de la table (poids le plus faible). */
export function rarestEntry(table: ExpeditionLootEntry[]): ExpeditionLootEntry | null {
  return byRarity(table)[table.length - 1] ?? null;
}

/**
 * Tire une entrée. `luck` (0..1) décale le jet vers la FIN de la table, donc vers
 * les entrées rares.
 *
 * Auparavant le bonus de chance de la maîtrise n'intervenait qu'APRÈS ce tirage,
 * sur la quantité obtenue dans [min, max]. Comme les ressources rares ont
 * min = max = 1, il n'avait strictement AUCUN effet sur elles : ni sur la
 * probabilité, ni sur la quantité. Monter sa maîtrise n'apportait donc rien là
 * où ça comptait.
 */
function pickWeighted(table: ExpeditionLootEntry[], rng: Rng, luck = 0): ExpeditionLootEntry | null {
  const sorted = byRarity(table);
  const total = sorted.reduce((s, e) => s + Math.max(0, e.weight), 0);
  if (total <= 0) return null;
  const l = Math.min(0.95, Math.max(0, luck));
  let r = (rng.next() * (1 - l) + l) * total;
  for (const e of sorted) {
    r -= Math.max(0, e.weight);
    if (r <= 0) return e;
  }
  return sorted[sorted.length - 1] ?? null;
}

/**
 * Tire le butin de matériaux uniques d'une expédition (déterministe pour un rng
 * donné). Renvoie une map { resource: quantité }.
 *
 * `bonus` (maîtrise) : `luckBonus` tire chaque jet vers le haut (loot « assuré »)
 * et `qtyMult` gonfle les quantités finales. Sans bonus → comportement neutre.
 */
export function rollExpeditionLoot(
  type: ExpeditionType,
  rng: Rng,
  bonus: ExpeditionMasteryBonus = { speedMult: 1, luckBonus: 0, qtyMult: 1 },
  opts: { guaranteeRare?: boolean } = {},
): Record<string, number> {
  const out: Record<string, number> = {};
  const rolls = expeditionLootRolls(type);
  for (let i = 0; i < rolls; i++) {
    // La chance de maîtrise biaise désormais AUSSI le choix de la ressource, pas
    // seulement la quantité — sans quoi elle n'avait aucun effet sur les rares.
    const entry = pickWeighted(type.loot_table, rng, bonus.luckBonus);
    if (!entry) continue;
    const roll = Math.min(0.999999, rng.next() + bonus.luckBonus);
    const base = entry.min + Math.floor(roll * (entry.max - entry.min + 1));
    const amount = Math.round(base * bonus.qtyMult);
    if (amount > 0) out[entry.resource] = (out[entry.resource] ?? 0) + amount;
  }
  // PITIÉ : au-delà de `EXPEDITION_PITY_LIMIT` expéditions consécutives sans la
  // ressource rare, la suivante la garantit. Sur la Forêt Fossile, un quart des
  // joueurs enchaînaient 5 expéditions — 15 heures d'attente — sans en voir une
  // seule ; ce n'était pas de la malchance exceptionnelle mais le cas nominal.
  if (opts.guaranteeRare) {
    const rare = rarestEntry(type.loot_table);
    if (rare && !out[rare.resource]) {
      out[rare.resource] = Math.max(1, Math.round(rare.min * bonus.qtyMult));
    }
  }
  return out;
}

/**
 * Nombre d'expéditions consécutives SANS ressource rare au-delà duquel la
 * suivante la garantit. 2 → la 3ᵉ ne peut pas échouer.
 */
export const EXPEDITION_PITY_LIMIT = 2;

/** La prochaine expédition doit-elle garantir la rare ? */
export function expeditionPityDue(missesInARow: number): boolean {
  return missesInARow >= EXPEDITION_PITY_LIMIT;
}

/** Le butin obtenu contient-il la ressource rare de cette table ? */
export function lootHasRare(type: ExpeditionType, loot: Record<string, number>): boolean {
  const rare = rarestEntry(type.loot_table);
  return Boolean(rare && (loot[rare.resource] ?? 0) > 0);
}

/** L'expédition est-elle terminée (temps écoulé) ? */
export function isExpeditionDone(endsAtMs: number, nowMs: number): boolean {
  return nowMs >= endsAtMs;
}

/* ------------------------------------------------------------------ *
 * ARBRE DE COMPÉTENCES D'EXPÉDITION                                   *
 * ------------------------------------------------------------------ *
 * Le niveau d'expédition donnait des bonus AUTOMATIQUES, identiques
 * pour tout le monde : monter ne posait aucun choix. L'arbre reprend
 * exactement les trois leviers de `expeditionMasteryBonus` — durée,
 * chance, quantité — et laisse le joueur décider lequel il pousse.
 *
 * Il AMPLIFIE la maîtrise, il ne la remplace pas : les deux s'ajoutent.
 * Et la capacité totale de l'arbre (27 points) dépasse volontairement le
 * budget maximal (20) — sans ce déséquilibre, « choisir » reviendrait à
 * tout prendre dans l'ordre qu'on veut.                                */

/** Points de compétence d'expédition disponibles : 1 par niveau. */
export function expeditionSkillPoints(level: number): number {
  return Math.max(0, Math.min(MAX_EXPEDITION_LEVEL, Math.floor(level)));
}

export type ExpeditionSkillNode = {
  id: string;
  branch: 'celerite' | 'fortune' | 'abondance';
  name: string;
  desc: string;
  maxRank: number;
  /** Effet AJOUTÉ par rang (cumulatif). */
  perRank: { speed?: number; luck?: number; qty?: number };
};

/** Allocation du joueur : id de nœud → rangs achetés. */
export type ExpeditionAlloc = Record<string, number>;

export const EXPEDITION_BRANCH_LABEL: Record<ExpeditionSkillNode['branch'], string> = {
  celerite: 'Célérité',
  fortune: 'Fortune',
  abondance: 'Abondance',
};

/**
 * Trois branches de trois nœuds, rangs de plus en plus rentables pour que
 * s'enfoncer dans une branche récompense mieux que picorer partout.
 */
export const EXPEDITION_SKILLS: ExpeditionSkillNode[] = [
  // — Célérité : raccourcit l'expédition (jusqu'à −18 % à fond).
  { id: 'exp_cel_1', branch: 'celerite', name: 'Portage allégé', desc: 'Durée −1,5 % par rang.', maxRank: 3, perRank: { speed: 0.015 } },
  { id: 'exp_cel_2', branch: 'celerite', name: 'Éclaireurs', desc: 'Durée −2 % par rang.', maxRank: 3, perRank: { speed: 0.02 } },
  { id: 'exp_cel_3', branch: 'celerite', name: 'Relais de route', desc: 'Durée −2,5 % par rang.', maxRank: 3, perRank: { speed: 0.025 } },
  // — Fortune : tire le butin vers les ressources rares (jusqu'à +0,27).
  { id: 'exp_for_1', branch: 'fortune', name: 'Œil du chineur', desc: 'Chance de rare +0,02 par rang.', maxRank: 3, perRank: { luck: 0.02 } },
  { id: 'exp_for_2', branch: 'fortune', name: 'Cartes anciennes', desc: 'Chance de rare +0,03 par rang.', maxRank: 3, perRank: { luck: 0.03 } },
  { id: 'exp_for_3', branch: 'fortune', name: 'Flair du pilleur', desc: 'Chance de rare +0,04 par rang.', maxRank: 3, perRank: { luck: 0.04 } },
  // — Abondance : augmente les quantités rapportées (jusqu'à +27 %).
  { id: 'exp_abo_1', branch: 'abondance', name: 'Sacoches renforcées', desc: 'Quantités +2 % par rang.', maxRank: 3, perRank: { qty: 0.02 } },
  { id: 'exp_abo_2', branch: 'abondance', name: 'Bêtes de somme', desc: 'Quantités +3 % par rang.', maxRank: 3, perRank: { qty: 0.03 } },
  { id: 'exp_abo_3', branch: 'abondance', name: 'Convoi organisé', desc: 'Quantités +4 % par rang.', maxRank: 3, perRank: { qty: 0.04 } },
];

export function expeditionNodeById(id: string): ExpeditionSkillNode | undefined {
  return EXPEDITION_SKILLS.find((n) => n.id === id);
}

/** Points dépensés dans une allocation (rangs plafonnés, nœuds inconnus ignorés). */
export function expeditionSkillSpent(alloc: ExpeditionAlloc): number {
  let total = 0;
  for (const node of EXPEDITION_SKILLS) {
    total += Math.max(0, Math.min(alloc[node.id] ?? 0, node.maxRank));
  }
  return total;
}

export type ExpeditionAllocCheck = { ok: boolean; reason?: string };

/**
 * Valide une allocation COMPLÈTE (état absolu, pas un delta) : chaque nœud
 * existe, aucun rang négatif ou au-delà du max, et le total tient dans le budget
 * du niveau. Rejouée côté serveur, qui ne fait jamais confiance au client.
 */
export function validateExpeditionAlloc(
  alloc: ExpeditionAlloc,
  level: number,
): ExpeditionAllocCheck {
  for (const [id, rank] of Object.entries(alloc)) {
    const node = expeditionNodeById(id);
    if (!node) return { ok: false, reason: `Compétence inconnue : ${id}` };
    if (!Number.isInteger(rank) || rank < 0) return { ok: false, reason: 'Rang invalide' };
    if (rank > node.maxRank) return { ok: false, reason: `« ${node.name} » plafonne au rang ${node.maxRank}` };
  }
  const spent = expeditionSkillSpent(alloc);
  const budget = expeditionSkillPoints(level);
  if (spent > budget) {
    return { ok: false, reason: `${spent} points dépensés pour ${budget} disponibles` };
  }
  return { ok: true };
}

/** Bonus APPORTÉS par l'arbre seul (0 si rien n'est alloué). */
export function expeditionSkillBonus(alloc: ExpeditionAlloc): {
  speedCut: number;
  luckBonus: number;
  qtyBonus: number;
} {
  let speedCut = 0;
  let luckBonus = 0;
  let qtyBonus = 0;
  for (const node of EXPEDITION_SKILLS) {
    const rank = Math.max(0, Math.min(alloc[node.id] ?? 0, node.maxRank));
    if (rank === 0) continue;
    speedCut += (node.perRank.speed ?? 0) * rank;
    luckBonus += (node.perRank.luck ?? 0) * rank;
    qtyBonus += (node.perRank.qty ?? 0) * rank;
  }
  return { speedCut, luckBonus, qtyBonus };
}

/**
 * Bonus TOTAL : maîtrise (automatique) + arbre (choisi). C'est cette fonction que
 * le serveur doit utiliser — `expeditionMasteryBonus` seule ignorerait l'arbre.
 *
 * `speedMult` est borné à 0,5 : même tout investi, une expédition ne peut pas
 * durer moins de la moitié de sa durée de base.
 */
export function expeditionTotalBonus(
  level: number,
  alloc: ExpeditionAlloc,
): ExpeditionMasteryBonus {
  const base = expeditionMasteryBonus(level);
  const tree = expeditionSkillBonus(alloc);
  return {
    speedMult: Math.max(0.5, base.speedMult - tree.speedCut),
    luckBonus: base.luckBonus + tree.luckBonus,
    qtyMult: base.qtyMult + tree.qtyBonus,
  };
}
