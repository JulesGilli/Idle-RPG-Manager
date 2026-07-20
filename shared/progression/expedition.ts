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
 * Facteur de durée dû à la PUISSANCE de l'escouade : le rapport entre ce que
 * l'expédition exige et ce qu'on lui envoie.
 *
 * Envoyer le strict minimum coûte la durée de base ; envoyer le DOUBLE la divise
 * par deux (2000 pour 1000 requis → 50 %). C'est une règle de trois, donc elle
 * se raisonne sans consulter de table : « deux fois plus fort, deux fois plus
 * vite ». Plancher à 40 % — au-delà, sur-stuffer ne rapporte plus rien, sinon un
 * joueur d'arc 2 boucle les expéditions d'arc 1 en quelques minutes.
 *
 * Remplace l'ancien facteur au NIVEAU d'équipe (−5 % par niveau au-dessus du
 * requis), qui ignorait l'équipement : deux escouades de même niveau mais de
 * puissance très différente mettaient exactement le même temps.
 */
export function expeditionPowerFactor(requiredPower: number, teamPower: number): number {
  if (requiredPower <= 0 || teamPower <= 0) return 1;
  return Math.min(1, Math.max(MIN_DURATION_FACTOR, requiredPower / teamPower));
}

/**
 * Durée réelle (secondes) : durée de base × facteur de PUISSANCE × bonus de
 * maîtrise et d'arbre.
 *
 * `arc` sert à obtenir l'exigence de puissance réellement en vigueur — la
 * comparer à la valeur brute rendrait les expéditions d'arc 2 instantanées.
 */
export function computeExpeditionDuration(
  type: ExpeditionType,
  teamPower: number,
  masteryLevel = 1,
  /** Arbre d'expédition. Omis = aucun bonus d'arbre. */
  alloc: ExpeditionAlloc = {},
  arc = 1,
): number {
  const factor = expeditionPowerFactor(expeditionRequiredPower(type, arc), teamPower);
  const { speedMult } = expeditionTotalBonus(masteryLevel, alloc);
  return Math.round(type.duration_base_seconds * factor * speedMult);
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
  opts: { guaranteeRare?: boolean; guaranteeAll?: boolean } = {},
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

  // INVENTAIRE COMPLET (palier d'arbre) : chaque matériau de la table est présent
  // au moins une fois. Ne REMPLACE pas ce qui est tombé — il ne fait que combler
  // les manques, sinon le palier punirait un bon tirage.
  if (opts.guaranteeAll) {
    for (const entry of type.loot_table) {
      if (!out[entry.resource]) {
        out[entry.resource] = Math.max(1, Math.round(entry.min * bonus.qtyMult));
      }
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
 * ARBRE DE COMPÉTENCES D'EXPÉDITION — ÉCHELLE LINÉAIRE                *
 * ------------------------------------------------------------------ *
 * UNE seule branche, gravie du bas vers le haut : chaque palier exige
 * que le précédent soit complet. Ce n'est pas un arbre de CHOIX mais
 * une progression — la récompense de monter en niveau d'expédition.
 *
 * 1 point par niveau, 20 niveaux, et l'échelle coûte exactement 20
 * points : au niveau max, tout est acquis. Le rythme reste donc lisible
 * (« il me manque N niveaux pour tel palier »).                        */

/** Points de compétence d'expédition disponibles : 1 par niveau. */
export function expeditionSkillPoints(level: number): number {
  return Math.max(0, Math.min(MAX_EXPEDITION_LEVEL, Math.floor(level)));
}

export type ExpeditionSkillNode = {
  id: string;
  name: string;
  desc: string;
  maxRank: number;
  /** Niveau d'expédition minimum pour toucher à ce palier (défaut 1). */
  minLevel?: number;
  /** Effet AJOUTÉ par rang (cumulatif). */
  perRank?: { speed?: number; luck?: number; qty?: number };
  /** Effet TOUT-OU-RIEN débloqué dès le rang 1. */
  unlock?: 'free_heroes' | 'full_loot';
};

/** Allocation du joueur : id de nœud → rangs achetés. */
export type ExpeditionAlloc = Record<string, number>;

/**
 * L'échelle, du 1er au dernier palier. L'ORDRE FAIT FOI : un palier n'est
 * accessible que si tous ceux d'avant sont au rang max.
 *
 * « Intendance autonome » est placée pour coûter exactement le 6ᵉ point
 * (3 + 2 avant elle) : elle tombe donc pile au niveau 6.
 */
export const EXPEDITION_SKILLS: ExpeditionSkillNode[] = [
  {
    id: 'exp_portage',
    name: 'Portage allégé',
    desc: 'Durée réduite de 3 % par rang.',
    maxRank: 3,
    perRank: { speed: 0.03 },
  },
  {
    id: 'exp_sacoches',
    name: 'Sacoches renforcées',
    desc: 'Quantités rapportées +5 % par rang.',
    maxRank: 2,
    perRank: { qty: 0.05 },
  },
  {
    id: 'exp_intendance',
    name: 'Intendance autonome',
    desc: "Les héros ne sont plus immobilisés pendant l'expédition.",
    maxRank: 1,
    minLevel: 6,
    unlock: 'free_heroes',
  },
  {
    id: 'exp_chineur',
    name: 'Œil du chineur',
    desc: 'Chance de ressource rare +4 % par rang.',
    maxRank: 3,
    perRank: { luck: 0.04 },
  },
  {
    id: 'exp_convoi',
    name: 'Convoi organisé',
    desc: 'Durée réduite de 4 % par rang.',
    maxRank: 3,
    perRank: { speed: 0.04 },
  },
  {
    id: 'exp_inventaire',
    name: 'Inventaire complet',
    desc: "Garantit au moins un exemplaire de CHAQUE matériau de l'expédition.",
    maxRank: 1,
    unlock: 'full_loot',
  },
  {
    id: 'exp_pilleur',
    name: 'Flair du pilleur',
    desc: 'Chance de ressource rare +6 % par rang.',
    maxRank: 3,
    perRank: { luck: 0.06 },
  },
  {
    id: 'exp_caravane',
    name: 'Caravane',
    desc: 'Quantités rapportées +8 % par rang.',
    maxRank: 4,
    perRank: { qty: 0.08 },
  },
];

export function expeditionNodeById(id: string): ExpeditionSkillNode | undefined {
  return EXPEDITION_SKILLS.find((n) => n.id === id);
}

/** Coût total de l'échelle complète (vaut MAX_EXPEDITION_LEVEL — cf. tests). */
export function expeditionTreeCost(): number {
  return EXPEDITION_SKILLS.reduce((s, n) => s + n.maxRank, 0);
}

/** Points dépensés (rangs plafonnés, nœuds inconnus ignorés). */
export function expeditionSkillSpent(alloc: ExpeditionAlloc): number {
  let total = 0;
  for (const node of EXPEDITION_SKILLS) {
    total += Math.max(0, Math.min(alloc[node.id] ?? 0, node.maxRank));
  }
  return total;
}

/** Rang effectif d'un nœud (borné par son max). */
export function expeditionRank(alloc: ExpeditionAlloc, id: string): number {
  const node = expeditionNodeById(id);
  if (!node) return 0;
  return Math.max(0, Math.min(alloc[id] ?? 0, node.maxRank));
}

/**
 * Points à avoir investi AVANT de pouvoir toucher à ce palier : la somme des
 * rangs max de tous ceux qui le précèdent. C'est ce qui fait l'échelle.
 */
export function expeditionNodeRequirement(id: string): number {
  let sum = 0;
  for (const node of EXPEDITION_SKILLS) {
    if (node.id === id) return sum;
    sum += node.maxRank;
  }
  return Number.POSITIVE_INFINITY;
}

export type ExpeditionAllocCheck = { ok: boolean; reason?: string };

/**
 * Valide une allocation COMPLÈTE (état absolu, jamais un delta) : nœuds connus,
 * rangs entiers dans les bornes, budget respecté, ORDRE de l'échelle respecté et
 * niveaux minimum atteints. Rejouée côté serveur, qui ne croit pas le client.
 */
export function validateExpeditionAlloc(
  alloc: ExpeditionAlloc,
  level: number,
): ExpeditionAllocCheck {
  for (const [id, rank] of Object.entries(alloc)) {
    const node = expeditionNodeById(id);
    if (!node) return { ok: false, reason: 'Compétence inconnue : ' + id };
    if (!Number.isInteger(rank) || rank < 0) return { ok: false, reason: 'Rang invalide' };
    if (rank > node.maxRank) {
      return { ok: false, reason: '« ' + node.name + ' » plafonne au rang ' + node.maxRank };
    }
  }

  const spent = expeditionSkillSpent(alloc);
  const budget = expeditionSkillPoints(level);
  if (spent > budget) {
    return { ok: false, reason: spent + ' points dépensés pour ' + budget + ' disponibles' };
  }

  // Échelle : un palier entamé exige que TOUS les précédents soient au max.
  let cumul = 0;
  for (const node of EXPEDITION_SKILLS) {
    const rank = expeditionRank(alloc, node.id);
    if (rank > 0) {
      if (cumul < expeditionNodeRequirement(node.id)) {
        return { ok: false, reason: 'Termine les paliers précédant « ' + node.name + ' »' };
      }
      if (node.minLevel && level < node.minLevel) {
        return { ok: false, reason: '« ' + node.name + ' » demande le niveau ' + node.minLevel };
      }
    }
    cumul += rank;
  }
  return { ok: true };
}

/** Le joueur a-t-il débloqué ce palier tout-ou-rien ? */
export function expeditionHasUnlock(
  alloc: ExpeditionAlloc,
  unlock: NonNullable<ExpeditionSkillNode['unlock']>,
): boolean {
  return EXPEDITION_SKILLS.some((n) => n.unlock === unlock && expeditionRank(alloc, n.id) > 0);
}

/**
 * Les héros partent-ils SANS être immobilisés ? Faux tant qu'« Intendance
 * autonome » n'est pas prise : par défaut, une expédition mobilise son escouade.
 */
export function expeditionFreesHeroes(alloc: ExpeditionAlloc): boolean {
  return expeditionHasUnlock(alloc, 'free_heroes');
}

/** Le butin garantit-il un exemplaire de chaque matériau ? */
export function expeditionFullLoot(alloc: ExpeditionAlloc): boolean {
  return expeditionHasUnlock(alloc, 'full_loot');
}

/** Bonus APPORTÉS par l'échelle seule (0 si rien n'est alloué). */
export function expeditionSkillBonus(alloc: ExpeditionAlloc): {
  speedCut: number;
  luckBonus: number;
  qtyBonus: number;
} {
  let speedCut = 0;
  let luckBonus = 0;
  let qtyBonus = 0;
  for (const node of EXPEDITION_SKILLS) {
    const rank = expeditionRank(alloc, node.id);
    if (rank === 0 || !node.perRank) continue;
    speedCut += (node.perRank.speed ?? 0) * rank;
    luckBonus += (node.perRank.luck ?? 0) * rank;
    qtyBonus += (node.perRank.qty ?? 0) * rank;
  }
  return { speedCut, luckBonus, qtyBonus };
}

/**
 * Bonus TOTAL : maîtrise (automatique) + échelle (achetée). C'est cette fonction
 * que le serveur doit utiliser — la maîtrise seule ignorerait l'arbre.
 *
 * `speedMult` est borné à 0,5 : l'échelle seule ne descend pas sous la moitié.
 * La réduction par PUISSANCE se cumule par-dessus, avec son propre plancher.
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
