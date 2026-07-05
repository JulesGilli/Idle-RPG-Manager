/**
 * Arbres de compétence par classe (Bibliothèque du Savoir).
 * Chaque niveau gagné octroie 1 point de compétence. Un nœud n'accorde JAMAIS de
 * stat brute (les stats montent automatiquement au niveau) : uniquement des
 * EFFETS SPÉCIAUX — soit un passif de combat (crit, vampirisme, égide…),
 * soit une abilité (proc à l'attaque ou capacité active). Pur, partagé front + Edge.
 */
import type { Ability, AutocastAction, CombatPassive, CombatRole, PassiveType, StatusType } from '../combat/types.ts';

export type ClassId = 'guerrier' | 'archer' | 'mage' | 'paladin' | 'soigneur';

/** Rôle de combat (comportement d'IA) dérivé de la classe. */
export function combatRole(classId: string): CombatRole {
  if (classId === 'soigneur') return 'healer';
  if (classId === 'guerrier' || classId === 'paladin') return 'tank';
  return 'dps';
}

/**
 * Gabarit d'abilité porté par un nœud : valeur concrète = base + perRank × rang.
 * (Les champs non pertinents pour un `kind` sont ignorés.)
 */
export type AbilitySpec = {
  kind: Ability['kind'];
  status?: StatusType;
  chance?: number;
  chancePerRank?: number;
  potency?: number;
  potencyPerRank?: number;
  duration?: number;
  durationPerRank?: number;
  value?: number;
  valuePerRank?: number;
  bonus?: number;
  bonusPerRank?: number;
  extraTargets?: number;
  everyRounds?: number;
  action?: AutocastAction;
  hpPct?: number;
};

/** Gabarit de passif de combat : valeur (fraction) = value + valuePerRank × rang. */
export type PassiveSpec = { type: PassiveType; value?: number; valuePerRank?: number };

export type SkillNode = {
  id: string;
  name: string;
  desc: string;
  icon: string;
  maxRank: number;
  requires: string[];
  row: number;
  col: number;
  /** Passifs de combat accordés (montent avec le rang). */
  passives?: PassiveSpec[];
  /** Abilités actives/procs accordées (montent avec le rang). */
  abilities?: AbilitySpec[];
};

/** État appris d'un héros : map nodeId → rang courant. */
export type LearnedSkills = Record<string, number>;

/* ------------------------------------------------------------- GUERRIER -- */
// Briseur (pénétration/affaiblissement/exécution) + Berserk (rage/vampirisme/épines).
const GUERRIER_TREE: SkillNode[] = [
  { id: 'g_penetration', name: 'Frappe pénétrante', desc: 'Ignore 12% d’armure par rang', icon: '🪓',
    maxRank: 3, requires: [], row: 0, col: 0,
    abilities: [{ kind: 'armor_pen', value: 0, valuePerRank: 0.12 }] },
  { id: 'g_entaille', name: 'Entaille', desc: '25%/rang d’affaiblir la cible (−20% ATK/DEF)', icon: '🩸',
    maxRank: 3, requires: ['g_penetration'], row: 1, col: 0,
    abilities: [{ kind: 'on_hit', status: 'weaken', chance: 0, chancePerRank: 0.25, potency: 0.2, duration: 2 }] },
  { id: 'g_execution', name: 'Exécution', desc: '+15%/rang de dégâts sous 30% PV', icon: '☠️',
    maxRank: 3, requires: ['g_entaille'], row: 2, col: 0,
    passives: [{ type: 'execute', value: 0, valuePerRank: 0.15 }] },
  { id: 'g_rage', name: 'Rage sanguinaire', desc: '+15%/rang de dégâts sous 50% PV', icon: '😡',
    maxRank: 3, requires: [], row: 0, col: 2,
    passives: [{ type: 'rage', value: 0, valuePerRank: 0.15 }] },
  { id: 'g_soif', name: 'Soif de sang', desc: 'Vole 8%/rang des dégâts en PV', icon: '🩸',
    maxRank: 3, requires: ['g_rage'], row: 1, col: 2,
    passives: [{ type: 'lifesteal', value: 0, valuePerRank: 0.08 }] },
  { id: 'g_epines', name: 'Armure à pointes', desc: 'Renvoie 12%/rang des dégâts subis', icon: '🌵',
    maxRank: 3, requires: ['g_soif'], row: 2, col: 2,
    passives: [{ type: 'thorns', value: 0, valuePerRank: 0.12 }] },
  { id: 'g_broyeur', name: 'Broyeur d’armure', desc: 'Ultime : +25% pénétration, affaiblit à l’attaque ET +30% de dégâts sur les cibles affaiblies', icon: '⚒️',
    maxRank: 1, requires: ['g_execution', 'g_epines'], row: 3, col: 1,
    abilities: [
      { kind: 'armor_pen', value: 0.25 },
      { kind: 'on_hit', status: 'weaken', chance: 0.6, potency: 0.25, duration: 2 },
      { kind: 'amp_vs_status', status: 'weaken', bonus: 0.3 },
    ] },
];

/* --------------------------------------------------------------- ARCHER -- */
// Toxique (poison qui s'amplifie) + Volée (affaiblir/crit/multi-cibles).
const ARCHER_TREE: SkillNode[] = [
  { id: 'a_poison', name: 'Tir empoisonné', desc: '15%/rang d’empoisonner (DoT, 3 tours)', icon: '🏹',
    maxRank: 3, requires: [], row: 0, col: 0,
    abilities: [{ kind: 'on_hit', status: 'poison', chance: 0, chancePerRank: 0.15, potency: 0.15, duration: 3 }] },
  { id: 'a_venin', name: 'Venin virulent', desc: '+dégâts & durée du poison par rang', icon: '🧪',
    maxRank: 3, requires: ['a_poison'], row: 1, col: 0,
    abilities: [{ kind: 'on_hit', status: 'poison', chance: 0, potency: 0, potencyPerRank: 0.12, duration: 4, durationPerRank: 1 }] },
  { id: 'a_toxine', name: 'Toxine focalisée', desc: '+20%/rang de dégâts sur les cibles empoisonnées', icon: '🎯',
    maxRank: 3, requires: ['a_venin'], row: 2, col: 0,
    abilities: [{ kind: 'amp_vs_status', status: 'poison', bonus: 0, bonusPerRank: 0.2 }] },
  { id: 'a_affaiblir', name: 'Tir affaiblissant', desc: '20%/rang d’affaiblir la cible', icon: '💢',
    maxRank: 3, requires: [], row: 0, col: 2,
    abilities: [{ kind: 'on_hit', status: 'weaken', chance: 0, chancePerRank: 0.2, potency: 0.15, duration: 2 }] },
  { id: 'a_precision', name: 'Œil de faucon', desc: '8%/rang de coup critique (×2)', icon: '🦅',
    maxRank: 3, requires: ['a_affaiblir'], row: 1, col: 2,
    passives: [{ type: 'crit', value: 0, valuePerRank: 0.08 }] },
  { id: 'a_volee', name: 'Volée', desc: '25%/rang de frapper une cible en plus (applique aussi ton poison/affaiblissement dessus)', icon: '🏹',
    maxRank: 3, requires: ['a_precision'], row: 2, col: 2,
    abilities: [{ kind: 'multi_shot', chance: 0, chancePerRank: 0.25, extraTargets: 1 }] },
  { id: 'a_pluie', name: 'Pluie de flèches', desc: 'Ultime : tous les 4 tours, crible TOUS les ennemis (applique tes procs) + le poison se propage', icon: '🌧️',
    maxRank: 1, requires: ['a_toxine', 'a_volee'], row: 3, col: 1,
    abilities: [
      { kind: 'autocast', everyRounds: 4,
        action: { type: 'aoe', dmgMult: 1.1, status: 'poison', statusChance: 1, statusPotency: 0.15, statusDuration: 3 } },
      { kind: 'contagion', chance: 0.5 },
    ] },
];

/* ----------------------------------------------------------------- MAGE -- */
// Feu (burn + déflagration qui se propage) + Givre (affaiblir/égide/mirage).
const MAGE_TREE: SkillNode[] = [
  { id: 'm_embrasement', name: 'Embrasement', desc: '18%/rang d’enflammer (DoT feu)', icon: '🔥',
    maxRank: 3, requires: [], row: 0, col: 0,
    abilities: [{ kind: 'on_hit', status: 'burn', chance: 0, chancePerRank: 0.18, potency: 0.15, duration: 3 }] },
  { id: 'm_combustion', name: 'Combustion', desc: '+dégâts & durée du feu par rang', icon: '♨️',
    maxRank: 3, requires: ['m_embrasement'], row: 1, col: 0,
    abilities: [{ kind: 'on_hit', status: 'burn', chance: 0, potency: 0, potencyPerRank: 0.12, duration: 4, durationPerRank: 1 }] },
  { id: 'm_immolation', name: 'Immolation', desc: '+20%/rang de dégâts sur les cibles en feu', icon: '🌋',
    maxRank: 3, requires: ['m_combustion'], row: 2, col: 0,
    abilities: [{ kind: 'amp_vs_status', status: 'burn', bonus: 0, bonusPerRank: 0.2 }] },
  { id: 'm_givre', name: 'Éclat de givre', desc: '20%/rang d’affaiblir la cible', icon: '❄️',
    maxRank: 3, requires: [], row: 0, col: 2,
    abilities: [{ kind: 'on_hit', status: 'weaken', chance: 0, chancePerRank: 0.2, potency: 0.15, duration: 2 }] },
  { id: 'm_bouclier', name: 'Bouclier arcanique', desc: 'Réduit les dégâts subis de 6%/rang', icon: '🛡️',
    maxRank: 3, requires: ['m_givre'], row: 1, col: 2,
    passives: [{ type: 'shield', value: 0, valuePerRank: 0.06 }] },
  { id: 'm_mirage', name: 'Image miroir', desc: '5%/rang d’esquiver une attaque', icon: '🌀',
    maxRank: 3, requires: ['m_bouclier'], row: 2, col: 2,
    passives: [{ type: 'dodge', value: 0, valuePerRank: 0.05 }] },
  { id: 'm_deflagration', name: 'Déflagration', desc: 'Ultime : tous les 4 tours, AOE de feu sur tous ; le feu se propage aussi à chaque tic', icon: '💥',
    maxRank: 1, requires: ['m_immolation', 'm_mirage'], row: 3, col: 1,
    abilities: [
      { kind: 'autocast', everyRounds: 4,
        action: { type: 'aoe', dmgMult: 1.3, status: 'burn', statusChance: 1, statusPotency: 0.15, statusDuration: 3, spread: true } },
      { kind: 'contagion', chance: 0.5 },
    ] },
];

/* -------------------------------------------------------------- PALADIN -- */
// Sacré (régénération/vampirisme/résurrection) + Gardien (égide/épines/riposte).
const PALADIN_TREE: SkillNode[] = [
  { id: 'p_ferveur', name: 'Provocation', desc: 'Tous les 5 tours, provoque les ennemis pendant 3 tours (ils sont forcés de t’attaquer)', icon: '📣',
    maxRank: 1, requires: [], row: 0, col: 0,
    abilities: [{ kind: 'taunt', everyRounds: 5, duration: 3 }] },
  { id: 'p_zele', name: 'Zèle sacré', desc: 'Vole 8%/rang des dégâts en PV', icon: '⚜️',
    maxRank: 3, requires: ['p_ferveur'], row: 1, col: 0,
    passives: [{ type: 'lifesteal', value: 0, valuePerRank: 0.08 }] },
  { id: 'p_renaissance', name: 'Renaissance', desc: 'Ressuscite une fois par combat à 30% PV', icon: '🕊️',
    maxRank: 1, requires: ['p_zele'], row: 2, col: 0,
    abilities: [{ kind: 'revive', hpPct: 0.3 }] },
  { id: 'p_egide', name: 'Égide', desc: 'Réduit les dégâts subis de 6%/rang', icon: '🛡️',
    maxRank: 3, requires: [], row: 0, col: 2,
    passives: [{ type: 'shield', value: 0, valuePerRank: 0.06 }] },
  { id: 'p_represailles', name: 'Représailles', desc: 'Renvoie 12%/rang des dégâts subis', icon: '🌵',
    maxRank: 3, requires: ['p_egide'], row: 1, col: 2,
    passives: [{ type: 'thorns', value: 0, valuePerRank: 0.12 }] },
  { id: 'p_riposte', name: 'Riposte', desc: '25%/rang d’affaiblir à l’attaque', icon: '⚔️',
    maxRank: 3, requires: ['p_represailles'], row: 2, col: 2,
    abilities: [{ kind: 'on_hit', status: 'weaken', chance: 0, chancePerRank: 0.25, potency: 0.15, duration: 2 }] },
  { id: 'p_jugement', name: 'Jugement', desc: 'Ultime : tous les 5 tours, frappe divine qui étourdit les ennemis', icon: '⚡',
    maxRank: 1, requires: ['p_renaissance', 'p_riposte'], row: 3, col: 1,
    abilities: [{ kind: 'autocast', everyRounds: 5, action: { type: 'stun_all', duration: 1, dmgMult: 0.8 } }] },
];

/* ------------------------------------------------------------- SOIGNEUR -- */
// Lumière (régén/égide/résurrection) + Ferveur (esquive/châtiment/drain) + nova.
const SOIGNEUR_TREE: SkillNode[] = [
  { id: 's_regen', name: 'Aura de vie', desc: 'Régénère 3%/rang des PV max par tour', icon: '🌿',
    maxRank: 3, requires: [], row: 0, col: 0,
    passives: [{ type: 'regen', value: 0, valuePerRank: 0.03 }] },
  { id: 's_egide', name: 'Bénédiction', desc: 'Réduit les dégâts subis de 6%/rang', icon: '✚',
    maxRank: 3, requires: ['s_regen'], row: 1, col: 0,
    passives: [{ type: 'shield', value: 0, valuePerRank: 0.06 }] },
  { id: 's_intervention', name: 'Intervention divine', desc: 'Ressuscite une fois par combat à 25% PV', icon: '😇',
    maxRank: 1, requires: ['s_egide'], row: 2, col: 0,
    abilities: [{ kind: 'revive', hpPct: 0.25 }] },
  { id: 's_grace', name: 'Grâce', desc: '5%/rang d’esquiver une attaque', icon: '🕊️',
    maxRank: 3, requires: [], row: 0, col: 2,
    passives: [{ type: 'dodge', value: 0, valuePerRank: 0.05 }] },
  { id: 's_chatiment', name: 'Châtiment', desc: '20%/rang d’affaiblir à l’attaque', icon: '📖',
    maxRank: 3, requires: ['s_grace'], row: 1, col: 2,
    abilities: [{ kind: 'on_hit', status: 'weaken', chance: 0, chancePerRank: 0.2, potency: 0.15, duration: 2 }] },
  { id: 's_drain', name: 'Drain de vie', desc: 'Vole 7%/rang des dégâts en PV', icon: '💜',
    maxRank: 3, requires: ['s_chatiment'], row: 2, col: 2,
    passives: [{ type: 'lifesteal', value: 0, valuePerRank: 0.07 }] },
  { id: 's_nova', name: 'Nova sacrée', desc: 'Ultime : tous les 4 tours, explosion de lumière sur tous les ennemis', icon: '🌟',
    maxRank: 1, requires: ['s_intervention', 's_drain'], row: 3, col: 1,
    abilities: [{ kind: 'autocast', everyRounds: 4, action: { type: 'aoe', dmgMult: 1 } }] },
];

export const SKILL_TREES: Record<ClassId, SkillNode[]> = {
  guerrier: GUERRIER_TREE,
  archer: ARCHER_TREE,
  mage: MAGE_TREE,
  paladin: PALADIN_TREE,
  soigneur: SOIGNEUR_TREE,
};

/** Renvoie l'arbre d'une classe (vide si classe inconnue). */
export function skillTreeFor(classId: string): SkillNode[] {
  return SKILL_TREES[classId as ClassId] ?? [];
}

/* --------------------------------------------------------------- PASSIFS -- */

/** Passifs de combat effectifs d'un héros (somme des valeurs par type). */
export function computePassives(classId: string, learned: LearnedSkills): CombatPassive[] {
  const totals = new Map<PassiveType, number>();
  for (const node of skillTreeFor(classId)) {
    const rank = learned[node.id] ?? 0;
    if (rank <= 0 || !node.passives) continue;
    const r = Math.min(rank, node.maxRank);
    for (const p of node.passives) {
      const v = (p.value ?? 0) + (p.valuePerRank ?? 0) * r;
      if (v > 0) totals.set(p.type, (totals.get(p.type) ?? 0) + v);
    }
  }
  return [...totals].map(([type, value]) => ({ type, value }));
}

/* --------------------------------------------------------------- ABILITÉS -- */

function buildAbility(spec: AbilitySpec, rank: number): Ability {
  const num = (base?: number, per?: number): number => (base ?? 0) + (per ?? 0) * rank;
  switch (spec.kind) {
    case 'armor_pen':
      return { kind: 'armor_pen', value: num(spec.value, spec.valuePerRank) };
    case 'on_hit':
      return {
        kind: 'on_hit',
        status: spec.status ?? 'poison',
        chance: num(spec.chance, spec.chancePerRank),
        potency: num(spec.potency, spec.potencyPerRank),
        duration: Math.round(num(spec.duration, spec.durationPerRank)),
      };
    case 'multi_shot':
      return {
        kind: 'multi_shot',
        chance: num(spec.chance, spec.chancePerRank),
        extraTargets: spec.extraTargets ?? 1,
      };
    case 'amp_vs_status':
      return {
        kind: 'amp_vs_status',
        status: spec.status ?? 'poison',
        bonus: num(spec.bonus, spec.bonusPerRank),
      };
    case 'autocast':
      return { kind: 'autocast', everyRounds: spec.everyRounds ?? 5, action: spec.action! };
    case 'revive':
      return { kind: 'revive', hpPct: spec.hpPct ?? 0.3 };
    case 'contagion':
      return { kind: 'contagion', chance: num(spec.chance, spec.chancePerRank) };
    case 'taunt':
      return {
        kind: 'taunt',
        everyRounds: spec.everyRounds ?? 5,
        duration: Math.round(num(spec.duration, spec.durationPerRank)),
      };
  }
}

/** Fusionne les abilités de même nature (somme des chances/potences, etc.). */
function mergeAbilities(list: Ability[]): Ability[] {
  let armorPen = 0;
  let revive = 0;
  const onHit = new Map<StatusType, { chance: number; potency: number; duration: number }>();
  const amp = new Map<StatusType, number>();
  let multiChance = 0;
  let multiExtra = 0;
  let contagion = 0;
  const autocasts: Ability[] = [];

  for (const a of list) {
    switch (a.kind) {
      case 'armor_pen':
        armorPen += a.value;
        break;
      case 'revive':
        revive = Math.max(revive, a.hpPct);
        break;
      case 'contagion':
        contagion = Math.max(contagion, a.chance);
        break;
      case 'on_hit': {
        const cur = onHit.get(a.status) ?? { chance: 0, potency: 0, duration: 0 };
        onHit.set(a.status, {
          chance: cur.chance + a.chance,
          potency: cur.potency + a.potency,
          duration: Math.max(cur.duration, a.duration),
        });
        break;
      }
      case 'amp_vs_status':
        amp.set(a.status, (amp.get(a.status) ?? 0) + a.bonus);
        break;
      case 'multi_shot':
        multiChance = Math.max(multiChance, a.chance);
        multiExtra = Math.max(multiExtra, a.extraTargets);
        break;
      case 'autocast':
      case 'taunt':
        autocasts.push(a);
        break;
    }
  }

  const out: Ability[] = [];
  if (armorPen > 0) out.push({ kind: 'armor_pen', value: armorPen });
  if (revive > 0) out.push({ kind: 'revive', hpPct: revive });
  for (const [status, v] of onHit) {
    if (v.chance > 0) out.push({ kind: 'on_hit', status, chance: v.chance, potency: v.potency, duration: v.duration });
  }
  for (const [status, bonus] of amp) if (bonus > 0) out.push({ kind: 'amp_vs_status', status, bonus });
  if (multiChance > 0) out.push({ kind: 'multi_shot', chance: multiChance, extraTargets: multiExtra });
  if (contagion > 0) out.push({ kind: 'contagion', chance: contagion });
  out.push(...autocasts);
  return out;
}

/** Abilités de combat effectives d'un héros, dérivées de ses nœuds appris. */
export function computeAbilities(classId: string, learned: LearnedSkills): Ability[] {
  const specs: Ability[] = [];
  for (const node of skillTreeFor(classId)) {
    const rank = learned[node.id] ?? 0;
    if (rank <= 0 || !node.abilities) continue;
    const r = Math.min(rank, node.maxRank);
    for (const spec of node.abilities) specs.push(buildAbility(spec, r));
  }
  return mergeAbilities(specs);
}

export type LearnCheck = { ok: boolean; reason?: string };

/** Valide l'achat d'un rang sur `nodeId` (nœud existe, cap, prérequis). */
export function validateLearn(
  classId: string,
  learned: LearnedSkills,
  nodeId: string,
): LearnCheck {
  const tree = skillTreeFor(classId);
  const node = tree.find((n) => n.id === nodeId);
  if (!node) return { ok: false, reason: 'Compétence inconnue' };

  const rank = learned[nodeId] ?? 0;
  if (rank >= node.maxRank) return { ok: false, reason: 'Rang maximum atteint' };

  for (const req of node.requires) {
    if ((learned[req] ?? 0) < 1) return { ok: false, reason: 'Prérequis non débloqué' };
  }
  return { ok: true };
}
