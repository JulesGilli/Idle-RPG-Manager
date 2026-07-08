/**
 * Arbres de compétence par classe (Bibliothèque du Savoir) — refonte 3 branches.
 *
 * Chaque classe a 3 BRANCHES autonomes, chacune de 5 nœuds :
 *   3 passifs (rang max 5) + 1 actif (rang max 3) + 1 ultime (rang max 2) = 20 pts/branche.
 * Un nœud n'accorde JAMAIS de stat brute : uniquement des EFFETS SPÉCIAUX (passif de
 * combat ou abilité/proc). Le capstone (ultime) ne se débloque qu'après 15 pts investis
 * DANS sa branche → spécialisation forcée. Pur, partagé front + Edge.
 *
 * Déploiement en phases : les nœuds dont le mécanisme n'existe pas encore dans le moteur
 * sont marqués `pending` (visibles mais pas encore apprenables). Ils s'allumeront au fil
 * des phases (auras, soins, stacks, défense réactive, dégâts spéciaux…).
 */
import type { Ability, AutocastAction, CombatPassive, CombatRole, MarkType, PassiveType, StatusType } from '../combat/types.ts';

export type ClassId = 'guerrier' | 'archer' | 'mage' | 'paladin' | 'soigneur';

/** Rôle de combat (comportement d'IA) dérivé de la classe. */
export function combatRole(classId: string): CombatRole {
  if (classId === 'soigneur') return 'healer';
  if (classId === 'guerrier' || classId === 'paladin') return 'tank';
  return 'dps';
}

/** Emplacement d'un nœud dans sa branche (dicte le rang max & le coût). */
export type NodeSlot = 'passive' | 'active' | 'ultimate';

/** Rang max par type d'emplacement. */
export const SLOT_MAX_RANK: Record<NodeSlot, number> = { passive: 5, active: 3, ultimate: 2 };

/** Points à investir DANS une branche avant de pouvoir toucher son ultime. */
export const ULTIMATE_GATE = 15;

/** Coût en or d'un reset, par point de compétence dépensé. */
export const RESET_GOLD_PER_POINT = 50;

/** Coût total d'un reset pour `spent` points dépensés. */
export function resetCost(spent: number): number {
  return Math.max(0, spent) * RESET_GOLD_PER_POINT;
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
  everyRoundsPerRank?: number;
  action?: AutocastAction;
  hpPct?: number;
  scope?: 'self' | 'team';
  stat?: 'atk' | 'def' | 'hp';
  mark?: MarkType;
  max?: number;
  threshold?: number;
  pct?: number;
  statuses?: StatusType[];
  afterRounds?: number;
};

/** Gabarit de passif de combat : valeur (fraction) = value + valuePerRank × rang. */
export type PassiveSpec = { type: PassiveType; value?: number; valuePerRank?: number };

export type SkillNode = {
  id: string;
  branch: 1 | 2 | 3;
  slot: NodeSlot;
  name: string;
  desc: string;
  icon: string;
  maxRank: number;
  /** Effet pas encore implémenté dans le moteur → non apprenable pour l'instant. */
  pending?: boolean;
  /** Passifs de combat accordés (montent avec le rang). */
  passives?: PassiveSpec[];
  /** Abilités actives/procs accordées (montent avec le rang). */
  abilities?: AbilitySpec[];
};

export type SkillBranch = { id: 1 | 2 | 3; name: string; color: string; nodes: SkillNode[] };

/** État appris d'un héros : map nodeId → rang courant. */
export type LearnedSkills = Record<string, number>;

/* --------------------------------------------------------------- helpers -- */

const passive = (
  id: string,
  branch: 1 | 2 | 3,
  name: string,
  icon: string,
  desc: string,
  effect: { passives?: PassiveSpec[]; abilities?: AbilitySpec[] } | 'pending',
): SkillNode => ({
  id, branch, slot: 'passive', name, icon, desc, maxRank: SLOT_MAX_RANK.passive,
  ...(effect === 'pending' ? { pending: true } : effect),
});
const active = (
  id: string,
  branch: 1 | 2 | 3,
  name: string,
  icon: string,
  desc: string,
  effect: { passives?: PassiveSpec[]; abilities?: AbilitySpec[] } | 'pending',
): SkillNode => ({
  id, branch, slot: 'active', name, icon, desc, maxRank: SLOT_MAX_RANK.active,
  ...(effect === 'pending' ? { pending: true } : effect),
});
const ultimate = (
  id: string,
  branch: 1 | 2 | 3,
  name: string,
  icon: string,
  desc: string,
  effect: { passives?: PassiveSpec[]; abilities?: AbilitySpec[] } | 'pending',
): SkillNode => ({
  id, branch, slot: 'ultimate', name, icon, desc, maxRank: SLOT_MAX_RANK.ultimate,
  ...(effect === 'pending' ? { pending: true } : effect),
});

/* ------------------------------------------------------------- GUERRIER -- */
const GUERRIER: SkillBranch[] = [
  { id: 1, name: 'Meneur', color: '#e8b64a', nodes: [
    passive('g_men_faille', 1, 'Point faible', '🎯',
      'À l’attaque, chance d’affaiblir la cible (−20% ATK/DEF) pendant 2 tours.',
      { abilities: [{ kind: 'on_hit', status: 'weaken', chance: 0.04, chancePerRank: 0.06, potency: 0.2, duration: 2 }] }),
    passive('g_men_banniere', 1, 'Bannière de guerre', '🚩', 'Aura permanente : +ATK à tous les alliés.',
      { abilities: [{ kind: 'stat_mod', scope: 'team', stat: 'atk', value: 0.01, valuePerRank: 0.02 }] }),
    passive('g_men_fureur', 1, 'Fureur du meneur', '🔥', 'Au tour 12, toute l’équipe entre en rage : +dégâts jusqu’à la fin du combat.',
      { abilities: [{ kind: 'delayed_buff', afterRounds: 12, value: 0.12, valuePerRank: 0.03 }] }),
    active('g_men_assommant', 1, 'Coup assommant', '🔨', 'Périodiquement, frappe et étourdit un ennemi pendant 2 tours.',
      { abilities: [{ kind: 'autocast', everyRounds: 6, everyRoundsPerRank: -1,
        action: { type: 'nuke', dmgMult: 0.6, status: 'stun', statusDuration: 2 } }] }),
    ultimate('g_men_cri', 1, 'Cri de désespoir', '📢', 'Périodiquement, toute l’équipe rejoue une attaque — même les alliés à terre frappent.',
      { abilities: [{ kind: 'autocast', everyRounds: 8, everyRoundsPerRank: -2, action: { type: 'extra_turn' } }] }),
  ] },
  { id: 2, name: 'Berserker', color: '#dc2626', nodes: [
    passive('g_ber_rage', 2, 'Rage montante', '💢', 'Plus tes PV sont bas, plus tu tapes fort (+dégâts sous 50% PV).',
      { passives: [{ type: 'rage', value: 0.05, valuePerRank: 0.03 }] }),
    passive('g_ber_oeil', 2, 'Œil du tueur', '🎯', '+chance de coup critique (×2 dégâts).',
      { passives: [{ type: 'crit', value: 0.05, valuePerRank: 0.06 }] }),
    passive('g_ber_sang', 2, 'Premier sang', '🩸', 'Le premier coup du combat inflige des dégâts bonus.',
      { passives: [{ type: 'first_strike', value: 0.12, valuePerRank: 0.08 }] }),
    active('g_ber_brutale', 2, 'Frappe brutale', '🪓', 'Ignore la quasi-totalité de l’armure de la cible (perce-défense).',
      { abilities: [{ kind: 'armor_pen', value: 0.3, valuePerRank: 0.3 }] }),
    ultimate('g_ber_execution', 2, 'Exécution', '⚔️', 'Dégâts massifs contre les cibles sous 30% PV.',
      { passives: [{ type: 'execute', value: 0.2, valuePerRank: 0.4 }] }),
  ] },
  { id: 3, name: 'Rempart', color: '#3b82f6', nodes: [
    passive('g_rem_parade', 3, 'Parade', '🛡️', 'Regagne chaque tour une barrière absorbant un % de tes PV max.',
      { abilities: [{ kind: 'barrier', value: 0, valuePerRank: 0.02 }] }),
    passive('g_rem_aura', 3, 'Aura de rempart', '🔷', 'Aura permanente : +DEF à tous les alliés.',
      { abilities: [{ kind: 'stat_mod', scope: 'team', stat: 'def', value: 0.01, valuePerRank: 0.02 }] }),
    passive('g_rem_contrecoup', 3, 'Contrecoup', '💥', 'Quand ta barrière est brisée, tu renvoies une attaque à l’attaquant.',
      { abilities: [{ kind: 'riposte_shield', bonus: 0.4, bonusPerRank: 0.08 }] }),
    active('g_rem_provoc', 3, 'Provocation', '📣', 'Force tous les ennemis à te cibler pendant plusieurs tours.',
      { abilities: [{ kind: 'taunt', everyRounds: 4, duration: 1, durationPerRank: 1 }] }),
    ultimate('g_rem_sacrifice', 3, 'Rempart du sacrifice', '⚖️', 'Périodiquement, l’équipe encaisse beaucoup moins de dégâts pendant quelques tours (+DEF).',
      { abilities: [{ kind: 'autocast', everyRounds: 7, everyRoundsPerRank: -1,
        action: { type: 'buff', scope: 'team', duration: 3, def: 0.05, reduce: 0.4 } }] }),
  ] },
];

/* --------------------------------------------------------------- ARCHER -- */
const ARCHER: SkillBranch[] = [
  { id: 1, name: 'Vipère', color: '#22c55e', nodes: [
    passive('a_vip_poison', 1, 'Pointes empoisonnées', '🐍', 'Chance d’empoisonner la cible à chaque attaque (le poison se cumule).',
      { abilities: [{ kind: 'on_hit', status: 'poison', chance: 0.3, chancePerRank: 0.08, potency: 0.14, potencyPerRank: 0.01, duration: 3 }] }),
    passive('a_vip_toxine', 1, 'Toxine concentrée', '☠️', 'Ton poison inflige des dégâts supplémentaires à chaque tic.',
      { abilities: [{ kind: 'dot_amp', status: 'poison', bonus: 0.04, bonusPerRank: 0.04 }] }),
    passive('a_vip_epidemie', 1, 'Épidémie', '🦠', 'Ton poison se propage à un autre ennemi.',
      { abilities: [{ kind: 'contagion', chance: 0.15, chancePerRank: 0.03 }] }),
    active('a_vip_volee', 1, 'Volée toxique', '🏹', 'Périodiquement, empoisonne tous les ennemis d’un coup.',
      { abilities: [{ kind: 'autocast', everyRounds: 6, everyRoundsPerRank: -1,
        action: { type: 'aoe', dmgMult: 0.35, status: 'poison', statusChance: 1, statusPotency: 0.15, statusDuration: 3 } }] }),
    ultimate('a_vip_fleau', 1, 'Fléau viral', '💀', 'Dégâts amplifiés contre les cibles empoisonnées.',
      { abilities: [{ kind: 'amp_vs_status', status: 'poison', bonus: 0, bonusPerRank: 0.25 }] }),
  ] },
  { id: 2, name: 'Tempête', color: '#06b6d4', nodes: [
    passive('a_tem_groupe', 2, 'Tir groupé', '🎯', 'Chance que ton attaque touche des ennemis supplémentaires.',
      { abilities: [{ kind: 'multi_shot', chance: 0.28, chancePerRank: 0.08, extraTargets: 1 }] }),
    passive('a_tem_rafale', 2, 'Rafale précise', '💨', '+chance de coup critique, et chance de tirer une seconde flèche dans le même tour.',
      { passives: [{ type: 'crit', value: 0.06, valuePerRank: 0.04 }],
        abilities: [{ kind: 'extra_attack', chance: 0.1, chancePerRank: 0.04 }] }),
    passive('a_tem_vent', 2, 'Vent mordant', '🌪️', 'Chance d’affaiblir les ennemis touchés.',
      { abilities: [{ kind: 'on_hit', status: 'weaken', chance: 0.1, chancePerRank: 0.05, potency: 0.15, duration: 2 }] }),
    active('a_tem_pluie', 2, 'Pluie de flèches', '🏹', 'Périodiquement, tire sur tous les ennemis.',
      { abilities: [{ kind: 'autocast', everyRounds: 5, everyRoundsPerRank: -1, action: { type: 'aoe', dmgMult: 1.35 } }] }),
    ultimate('a_tem_ouragan', 2, 'Ouragan', '🌀', 'Périodiquement, frappe TOUS les ennemis 2 fois d’affilée.',
      { abilities: [{ kind: 'autocast', everyRounds: 8, everyRoundsPerRank: -2,
        action: { type: 'multi_hit', hits: 2, dmgMult: 0.9 } }] }),
  ] },
  { id: 3, name: 'Œil de faucon', color: '#f59e0b', nodes: [
    passive('a_oeil_visee', 3, 'Visée mortelle', '🎯', '+forte chance de coup critique.',
      { passives: [{ type: 'crit', value: 0.12, valuePerRank: 0.1 }] }),
    passive('a_oeil_faille', 3, 'Point faible', '🔍', 'Ignore une grande partie de l’armure de la cible.',
      { abilities: [{ kind: 'armor_pen', value: 0.2, valuePerRank: 0.14 }] }),
    passive('a_oeil_grace', 3, 'Coup de grâce', '🏹', 'Dégâts bonus massifs contre les cibles à bas PV.',
      { passives: [{ type: 'execute', value: 0.3, valuePerRank: 0.14 }] }),
    active('a_oeil_perforante', 3, 'Flèche perforante', '🪶', 'Périodiquement, tir dévastateur qui étourdit un ennemi pendant 2 tours.',
      { abilities: [{ kind: 'autocast', everyRounds: 5, everyRoundsPerRank: -1,
        action: { type: 'nuke', dmgMult: 2.6, status: 'stun', statusDuration: 2 } }] }),
    ultimate('a_oeil_destin', 3, 'Tir du destin', '🎯', 'Inflige un % des PV max de la cible, plafonné par ton ATK (anti one-shot des boss).',
      { abilities: [{ kind: 'autocast', everyRounds: 8, everyRoundsPerRank: -2,
        action: { type: 'pct_hp', pct: 0.2, capMult: 4 } }] }),
  ] },
];

/* ----------------------------------------------------------------- MAGE -- */
const MAGE: SkillBranch[] = [
  { id: 1, name: 'Brasier', color: '#ef4444', nodes: [
    passive('m_bra_etincelle', 1, 'Étincelle', '🔥', 'Chance d’embraser la cible (DoT feu) et d’ajouter une stack d’embrasement.',
      { abilities: [
        { kind: 'on_hit', status: 'burn', chance: 0.25, chancePerRank: 0.05, potency: 0.15, duration: 3 },
        { kind: 'stack_on_hit', mark: 'burn', chance: 0.25, chancePerRank: 0.05, max: 5 },
      ] }),
    passive('m_bra_combustion', 1, 'Combustion', '💥', 'Tes dégâts augmentent par stack d’embrasement sur la cible.',
      { abilities: [{ kind: 'amp_per_stack', mark: 'burn', bonus: 0.03, bonusPerRank: 0.04 }] }),
    passive('m_bra_surchauffe', 1, 'Surchauffe', '🌋', 'À 5 stacks d’embrasement, la cible explose (dégâts + reset des stacks).',
      { abilities: [{ kind: 'detonate', mark: 'burn', threshold: 5, value: 0.22, valuePerRank: 0.15 }] }),
    active('m_bra_vague', 1, 'Vague de chaleur', '🔥', 'Périodiquement, embrase tous les ennemis (+1 stack chacun).',
      { abilities: [{ kind: 'autocast', everyRounds: 6, everyRoundsPerRank: -1,
        action: { type: 'aoe', dmgMult: 1.3, status: 'burn', statusChance: 1, statusPotency: 0.15, statusDuration: 3, spread: true, mark: 'burn' } }] }),
    ultimate('m_bra_cataclysme', 1, 'Cataclysme ardent', '☄️', 'Fait exploser les stacks d’embrasement de tous les ennemis.',
      { abilities: [{ kind: 'autocast', everyRounds: 7, everyRoundsPerRank: -1,
        action: { type: 'detonate_all', mark: 'burn', dmgMult: 2.6 } }] }),
  ] },
  { id: 2, name: 'Frimas', color: '#38bdf8', nodes: [
    passive('m_fri_morsure', 2, 'Morsure du gel', '❄️', 'Chance d’affaiblir la cible (−ATK/DEF) à chaque attaque.',
      { abilities: [{ kind: 'on_hit', status: 'weaken', chance: 0.2, chancePerRank: 0.05, potency: 0.15, duration: 2 }] }),
    passive('m_fri_fragilite', 2, 'Fragilité glaciale', '🧊', '+dégâts contre les cibles affaiblies.',
      { abilities: [{ kind: 'amp_vs_status', status: 'weaken', bonus: 0.09, bonusPerRank: 0.06 }] }),
    passive('m_fri_eclat', 2, 'Éclat gelé', '💎', '+chance de coup critique.',
      { passives: [{ type: 'crit', value: 0.05, valuePerRank: 0.03 }] }),
    active('m_fri_lance', 2, 'Lance de glace', '🧊', 'Périodiquement, frappe fort une cible et l’affaiblit lourdement.',
      { abilities: [{ kind: 'autocast', everyRounds: 6, everyRoundsPerRank: -1,
        action: { type: 'nuke', dmgMult: 2.5, status: 'weaken', statusPotency: 0.3, statusDuration: 3 } }] }),
    ultimate('m_fri_vent', 2, 'Vent glacial', '🌨️', 'Affaiblit tous les ennemis d’un souffle glacé.',
      { abilities: [{ kind: 'autocast', everyRounds: 7, everyRoundsPerRank: -1,
        action: { type: 'aoe', dmgMult: 1, status: 'weaken', statusChance: 1, statusPotency: 0.2, statusDuration: 2 } }] }),
  ] },
  { id: 3, name: 'Arcane', color: '#a855f7', nodes: [
    passive('m_arc_maitrise', 3, 'Maîtrise arcanique', '🔮', '+ATK permanent (toi seul).',
      { abilities: [{ kind: 'stat_mod', scope: 'self', stat: 'atk', value: 0.02, valuePerRank: 0.02 }] }),
    passive('m_arc_marque', 3, 'Marque arcanique', '🔯', 'Chaque attaque marque la cible (un coup critique en pose 2) : +dégâts par stack (cumul illimité).',
      { abilities: [
        { kind: 'stack_on_hit', mark: 'arcane', chance: 1, max: 99 },
        { kind: 'amp_per_stack', mark: 'arcane', bonus: 0.003, bonusPerRank: 0.002 },
      ] }),
    passive('m_arc_surcharge', 3, 'Surcharge mana', '⚡', '+chance de coup critique.',
      { passives: [{ type: 'crit', value: 0.03, valuePerRank: 0.03 }] }),
    active('m_arc_meteore', 3, 'Météore', '☄️', 'Périodiquement, gros dégâts de zone + 2 Marques arcaniques à chacun.',
      { abilities: [{ kind: 'autocast', everyRounds: 8, everyRoundsPerRank: -1,
        action: { type: 'aoe', dmgMult: 1.8, mark: 'arcane', markStacks: 2 } }] }),
    ultimate('m_arc_aneantissement', 3, 'Anéantissement', '💫', 'Périodiquement, sort brutal mono-cible + 3 Marques arcaniques.',
      { abilities: [{ kind: 'autocast', everyRounds: 8, everyRoundsPerRank: -2,
        action: { type: 'nuke', dmgMult: 4, mark: 'arcane', markStacks: 3 } }] }),
  ] },
];

/* -------------------------------------------------------------- PALADIN -- */
const PALADIN: SkillBranch[] = [
  { id: 1, name: 'Bastion', color: '#cbd5e1', nodes: [
    passive('p_bas_agro', 1, 'Provocation passive', '📛', 'Génère plus d’agressivité : les ennemis te ciblent plus souvent.',
      { abilities: [{ kind: 'threat', value: 0.1, valuePerRank: 0.1 }] }),
    passive('p_bas_volonte', 1, 'Volonté de fer', '🗿', 'Chance d’ignorer totalement un effet négatif subi (poison, feu, stun, affaiblissement).',
      { abilities: [{ kind: 'immune', chance: 0.1, chancePerRank: 0.1 }] }),
    passive('p_bas_ralliement', 1, 'Sacre du carnage', '💀', 'À chaque mort sur le champ de bataille (alliée comme ennemie), tu gagnes +ATK et +DEF, cumulatif — et une résurrection suivie d’une nouvelle mort recompte.',
      { abilities: [{ kind: 'rally_death', value: 0.04, valuePerRank: 0.04 }] }),
    active('p_bas_provoc', 1, 'Provocation', '📣', 'Force tous les ennemis à te cibler pendant plusieurs tours.',
      { abilities: [{ kind: 'taunt', everyRounds: 4, duration: 1, durationPerRank: 1 }] }),
    ultimate('p_bas_rempart', 1, 'Rempart inébranlable', '🏔️', 'Forte réduction des dégâts subis et régénération continue pendant que tu forces l’agro.',
      { passives: [
        { type: 'shield', value: 0.12, valuePerRank: 0.18 },
        { type: 'regen', value: 0.03, valuePerRank: 0.03 },
      ], abilities: [{ kind: 'taunt', everyRounds: 5, duration: 3 }] }),
  ] },
  { id: 2, name: 'Aegis', color: '#fcd34d', nodes: [
    passive('p_aeg_benediction', 2, 'Bénédiction protectrice', '✨', 'Chaque tour, chance de poser une barrière sur l’allié le plus faible.',
      { abilities: [{ kind: 'ally_shield', chance: 0.15, chancePerRank: 0.05, pct: 0.1 }] }),
    passive('p_aeg_lumiere', 2, 'Lumière tarissante', '💛', 'Soigne légèrement l’allié le plus bas en PV chaque tour.',
      { abilities: [{ kind: 'heal_aura', value: 0.01, valuePerRank: 0.01 }] }),
    passive('p_aeg_resilience', 2, 'Aura de résilience', '🔆', 'Barrière récurrente sur l’allié le plus exposé.',
      { abilities: [{ kind: 'ally_shield', chance: 0.4, chancePerRank: 0.1, pct: 0.05 }] }),
    active('p_aeg_etreinte', 2, 'Étreinte sacrée', '🙏', 'Périodiquement, vague de soins protectrice sur les alliés blessés.',
      { abilities: [{ kind: 'autocast', everyRounds: 5, everyRoundsPerRank: -1, action: { type: 'heal_all', pct: 0.12 } }] }),
    ultimate('p_aeg_jugement', 2, 'Jugement céleste', '⚡', 'Périodiquement, frappe une cible ; mort instantanée si elle est sous un seuil de PV.',
      { abilities: [{ kind: 'autocast', everyRounds: 8, everyRoundsPerRank: -2,
        action: { type: 'execute_strike', dmgMult: 2.5, instakillPct: 0.05 } }] }),
  ] },
  { id: 3, name: 'Paladin déchu', color: '#7c3aed', nodes: [
    passive('p_dec_pacte', 3, 'Pacte de sang', '🩸', '+PV max, mais −DEF : plus de vie, moins d’armure.',
      { abilities: [
        { kind: 'stat_mod', scope: 'self', stat: 'hp', value: 0.1, valuePerRank: 0.05 },
        { kind: 'stat_mod', scope: 'self', stat: 'def', value: -0.07, valuePerRank: -0.03 },
      ] }),
    passive('p_dec_regen', 3, 'Régénération maudite', '💜', 'Récupère un % des PV max chaque tour.',
      { passives: [{ type: 'regen', value: 0.04, valuePerRank: 0.02 }] }),
    passive('p_dec_epines', 3, 'Épines noires', '🖤', 'Renvoie un % des dégâts subis à l’attaquant.',
      { passives: [{ type: 'thorns', value: 0.15, valuePerRank: 0.1 }] }),
    active('p_dec_miroir', 3, 'Malédiction du miroir', '🪞', 'Périodiquement, double ton renvoi de dégâts (épines) pendant 2 tours.',
      { abilities: [{ kind: 'autocast', everyRounds: 5, everyRoundsPerRank: -1,
        action: { type: 'buff', scope: 'self', duration: 2, thornsMult: 1 } }] }),
    ultimate('p_dec_vengeance', 3, 'Vengeance du damné', '💀', 'Périodiquement, renvoie 100% des dégâts subis ET encaisse moitié moins, pendant 2 tours.',
      { abilities: [{ kind: 'autocast', everyRounds: 7, everyRoundsPerRank: -1,
        action: { type: 'buff', scope: 'self', duration: 2, reflect: 1, reduce: 0.5 } }] }),
  ] },
];

/* ------------------------------------------------------- CLERC (soigneur) -- */
const SOIGNEUR: SkillBranch[] = [
  { id: 1, name: 'Lumière', color: '#fde68a', nodes: [
    passive('s_lum_soin', 1, 'Soin ciblé', '✋', 'Chaque tour, soigne l’allié le plus bas en PV d’un % de ses PV max.',
      { abilities: [{ kind: 'heal_aura', value: 0.02, valuePerRank: 0.02 }] }),
    passive('s_lum_grace', 1, 'Grâce renforcée', '🌟', 'Tous tes soins sont augmentés.',
      { abilities: [{ kind: 'heal_amp', bonus: 0.05, bonusPerRank: 0.05 }] }),
    passive('s_lum_souffle', 1, 'Second souffle', '💫', 'Soigner un allié sous 50% PV lui octroie de l’ATK pendant 2 tours.',
      { abilities: [{ kind: 'heal_buff', value: 0.06, valuePerRank: 0.03, duration: 2 }] }),
    active('s_lum_rayon', 1, 'Rayon de vie', '✨', 'Périodiquement, déchaîne une vague de soins sur les alliés blessés.',
      { abilities: [{ kind: 'autocast', everyRounds: 5, everyRoundsPerRank: -1, action: { type: 'heal_all', pct: 0.15 } }] }),
    ultimate('s_lum_resurrection', 1, 'Résurrection partielle', '🕊️', 'Ramène un allié tombé avec une partie de ses PV.',
      { abilities: [{ kind: 'revive', hpPct: 0.3 }] }),
  ] },
  { id: 2, name: 'Bénédiction', color: '#f9a8d4', nodes: [
    passive('s_ben_benediction', 2, 'Bénédiction', '🕯️', 'Chaque tour, chance de poser un soin sur la durée à toute l’équipe.',
      { abilities: [{ kind: 'team_hot', chance: 0.15, chancePerRank: 0.05, pct: 0.01, duration: 3 }] }),
    passive('s_ben_rayonnement', 2, 'Rayonnement', '🌸', 'Une bénédiction plus durable veille en continu sur l’équipe.',
      { abilities: [{ kind: 'team_hot', chance: 0.1, chancePerRank: 0.05, pct: 0.01, duration: 5 }] }),
    passive('s_ben_echo', 2, 'Écho sacré', '🔔', 'Un souffle de vie soigne régulièrement l’allié le plus blessé.',
      { abilities: [{ kind: 'heal_aura', value: 0.01, valuePerRank: 0.01 }] }),
    active('s_ben_vague', 2, 'Vague de bénédiction', '🌊', 'Périodiquement, déchaîne une vague de soins sur toute l’équipe blessée.',
      { abilities: [{ kind: 'autocast', everyRounds: 5, everyRoundsPerRank: -1, action: { type: 'heal_all', pct: 0.1 } }] }),
    ultimate('s_ben_sanctuaire', 2, 'Sanctuaire', '⛩️', 'Périodiquement, un sanctuaire soigne massivement toute l’équipe.',
      { abilities: [{ kind: 'autocast', everyRounds: 7, everyRoundsPerRank: -2, action: { type: 'heal_all', pct: 0.2 } }] }),
  ] },
  { id: 3, name: 'Oracle', color: '#60a5fa', nodes: [
    passive('s_ora_puissance', 3, 'Chant de puissance', '⚔️', 'Aura permanente : +ATK à tous les alliés.',
      { abilities: [{ kind: 'stat_mod', scope: 'team', stat: 'atk', value: 0.01, valuePerRank: 0.01 }] }),
    passive('s_ora_fermete', 3, 'Chant de fermeté', '🛡️', 'Aura permanente : +DEF à tous les alliés.',
      { abilities: [{ kind: 'stat_mod', scope: 'team', stat: 'def', value: 0.01, valuePerRank: 0.01 }] }),
    passive('s_ora_vitalite', 3, 'Chant de vitalité', '❤️', 'Aura permanente : +PV max à tous les alliés.',
      { abilities: [{ kind: 'stat_mod', scope: 'team', stat: 'hp', value: 0.015, valuePerRank: 0.015 }] }),
    active('s_ora_rituel', 3, 'Rituel d’amplification', '🔷', 'Périodiquement, renforce toute l’équipe (+ATK/+DEF) pendant 2 tours.',
      { abilities: [{ kind: 'autocast', everyRounds: 6, everyRoundsPerRank: -1,
        action: { type: 'buff', scope: 'team', duration: 2, atk: 0.1, def: 0.1 } }] }),
    ultimate('s_ora_concert', 3, 'Concert céleste', '🎼', 'Périodiquement, buff massif ATK/DEF/vitesse à toute l’équipe pendant 3 tours.',
      { abilities: [{ kind: 'autocast', everyRounds: 8, everyRoundsPerRank: -2,
        action: { type: 'buff', scope: 'team', duration: 3, atk: 0.15, def: 0.15, speed: 0.15 } }] }),
  ] },
];

export const SKILL_TREES: Record<ClassId, SkillBranch[]> = {
  guerrier: GUERRIER,
  archer: ARCHER,
  mage: MAGE,
  paladin: PALADIN,
  soigneur: SOIGNEUR,
};

/** Branches d'une classe (vide si classe inconnue). */
export function skillTreeFor(classId: string): SkillBranch[] {
  return SKILL_TREES[classId as ClassId] ?? [];
}

/** Tous les nœuds d'une classe, à plat. */
export function allNodes(classId: string): SkillNode[] {
  return skillTreeFor(classId).flatMap((b) => b.nodes);
}

function nodeById(classId: string, nodeId: string): { node: SkillNode; branch: 1 | 2 | 3 } | null {
  for (const b of skillTreeFor(classId)) {
    const node = b.nodes.find((n) => n.id === nodeId);
    if (node) return { node, branch: b.id };
  }
  return null;
}

/** Somme des rangs appris dans une branche donnée. */
export function branchPoints(classId: string, learned: LearnedSkills, branch: 1 | 2 | 3): number {
  let total = 0;
  for (const b of skillTreeFor(classId)) {
    if (b.id !== branch) continue;
    for (const n of b.nodes) total += learned[n.id] ?? 0;
  }
  return total;
}

/** Total de points de compétence dépensés (tous nœuds valides confondus). */
export function spentPoints(classId: string, learned: LearnedSkills): number {
  let total = 0;
  for (const n of allNodes(classId)) total += Math.min(learned[n.id] ?? 0, n.maxRank);
  return total;
}

/* --------------------------------------------------------------- LOADOUT -- */

/**
 * Compétence ACTIVE + ULTIME effectivement équipées (une seule de chaque). Un
 * héros peut débloquer plusieurs actifs/ultimes dans son arbre, mais n'en active
 * qu'un de chaque : seuls ces deux nœuds s'appliquent en combat.
 */
export type SkillLoadout = { activeId?: string | null; ultimateId?: string | null };

/** Nœuds APPRIS (rang ≥ 1) d'un slot donné, dans l'ordre des branches. */
export function learnedNodesOfSlot(classId: string, learned: LearnedSkills, slot: NodeSlot): SkillNode[] {
  return allNodes(classId).filter((n) => n.slot === slot && !n.pending && (learned[n.id] ?? 0) > 0);
}

/**
 * Résout l'actif et l'ultime équipés. Le choix explicite prime ; à défaut (ou
 * s'il pointe un nœud non appris), on équipe automatiquement le PREMIER appris —
 * ainsi un héros a toujours au plus un actif + un ultime en jeu, jamais plus.
 */
export function resolveLoadout(
  classId: string,
  learned: LearnedSkills,
  loadout?: SkillLoadout,
): { activeId: string | null; ultimateId: string | null } {
  const pick = (stored: string | null | undefined, list: SkillNode[]): string | null =>
    stored && list.some((n) => n.id === stored) ? stored : (list[0]?.id ?? null);
  return {
    activeId: pick(loadout?.activeId, learnedNodesOfSlot(classId, learned, 'active')),
    ultimateId: pick(loadout?.ultimateId, learnedNodesOfSlot(classId, learned, 'ultimate')),
  };
}

/** Un nœud de slot activable (actif/ultime) ne compte que s'il est équipé. */
function nodeIsEquipped(node: SkillNode, activeId: string | null, ultimateId: string | null): boolean {
  if (node.slot === 'active') return node.id === activeId;
  if (node.slot === 'ultimate') return node.id === ultimateId;
  return true; // les passifs s'appliquent toujours
}

/* --------------------------------------------------------------- PASSIFS -- */

/**
 * Passifs de combat effectifs d'un héros (somme des valeurs par type). Les
 * passifs portés par un nœud actif/ultime ne comptent que si ce nœud est équipé.
 */
export function computePassives(
  classId: string,
  learned: LearnedSkills,
  loadout?: SkillLoadout,
): CombatPassive[] {
  const { activeId, ultimateId } = resolveLoadout(classId, learned, loadout);
  const totals = new Map<PassiveType, number>();
  for (const node of allNodes(classId)) {
    if (node.pending || !node.passives) continue;
    if (!nodeIsEquipped(node, activeId, ultimateId)) continue;
    const rank = learned[node.id] ?? 0;
    if (rank <= 0) continue;
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
    case 'extra_attack':
      return { kind: 'extra_attack', chance: num(spec.chance, spec.chancePerRank) };
    case 'amp_vs_status':
      return {
        kind: 'amp_vs_status',
        status: spec.status ?? 'poison',
        bonus: num(spec.bonus, spec.bonusPerRank),
      };
    case 'autocast':
      return {
        kind: 'autocast',
        everyRounds: Math.max(2, Math.round(num(spec.everyRounds ?? 5, spec.everyRoundsPerRank))),
        action: spec.action!,
      };
    case 'revive':
      return { kind: 'revive', hpPct: spec.hpPct ?? 0.3 };
    case 'contagion':
      return { kind: 'contagion', chance: Math.min(1, num(spec.chance, spec.chancePerRank)) };
    case 'taunt':
      return {
        kind: 'taunt',
        everyRounds: spec.everyRounds ?? 5,
        duration: Math.round(num(spec.duration, spec.durationPerRank)),
      };
    case 'stat_mod':
      return {
        kind: 'stat_mod',
        scope: spec.scope ?? 'team',
        stat: spec.stat ?? 'atk',
        value: num(spec.value, spec.valuePerRank),
      };
    case 'stack_on_hit':
      return {
        kind: 'stack_on_hit',
        mark: spec.mark ?? 'burn',
        chance: num(spec.chance, spec.chancePerRank),
        max: spec.max ?? 99,
      };
    case 'amp_per_stack':
      return { kind: 'amp_per_stack', mark: spec.mark ?? 'burn', bonus: num(spec.bonus, spec.bonusPerRank) };
    case 'detonate':
      return {
        kind: 'detonate',
        mark: spec.mark ?? 'burn',
        threshold: spec.threshold ?? 5,
        dmgMult: num(spec.value, spec.valuePerRank),
      };
    case 'immune':
      return {
        kind: 'immune',
        chance: num(spec.chance, spec.chancePerRank),
        ...(spec.statuses ? { statuses: spec.statuses } : {}),
      };
    case 'heal_aura':
      return { kind: 'heal_aura', pct: num(spec.value, spec.valuePerRank) };
    case 'heal_amp':
      return { kind: 'heal_amp', bonus: num(spec.bonus, spec.bonusPerRank) };
    case 'ally_shield':
      return { kind: 'ally_shield', chance: num(spec.chance, spec.chancePerRank), pct: spec.pct ?? 0.1 };
    case 'barrier':
      return { kind: 'barrier', pct: num(spec.value, spec.valuePerRank) };
    case 'delayed_buff':
      return { kind: 'delayed_buff', afterRounds: spec.afterRounds ?? 12, dmg: num(spec.value, spec.valuePerRank) };
    case 'threat':
      return { kind: 'threat', value: num(spec.value, spec.valuePerRank) };
    case 'dot_amp':
      return { kind: 'dot_amp', status: spec.status ?? 'poison', bonus: num(spec.bonus, spec.bonusPerRank) };
    case 'heal_buff':
      return { kind: 'heal_buff', atk: num(spec.value, spec.valuePerRank), duration: spec.duration ?? 2 };
    case 'riposte_shield':
      return { kind: 'riposte_shield', bonus: num(spec.bonus, spec.bonusPerRank) };
    case 'rally_death':
      return { kind: 'rally_death', value: num(spec.value, spec.valuePerRank) };
    case 'team_hot':
      return {
        kind: 'team_hot',
        chance: num(spec.chance, spec.chancePerRank),
        pct: spec.pct ?? 0.01,
        duration: spec.duration ?? 3,
      };
    default:
      // Capacités hors arbre de compétence (ex. accordées par un set) — non buildables ici.
      throw new Error(`Gabarit d'abilité non supporté: ${spec.kind}`);
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
  let extraAttackChance = 0;
  let contagion = 0;
  const autocasts: Ability[] = [];
  const statMods = new Map<string, { scope: 'self' | 'team'; stat: 'atk' | 'def' | 'hp'; value: number }>();

  for (const a of list) {
    switch (a.kind) {
      case 'stat_mod': {
        const key = `${a.scope}:${a.stat}`;
        const cur = statMods.get(key);
        if (cur) cur.value += a.value;
        else statMods.set(key, { scope: a.scope, stat: a.stat, value: a.value });
        break;
      }
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
      case 'extra_attack':
        extraAttackChance = Math.max(extraAttackChance, a.chance);
        break;
      case 'autocast':
      case 'taunt':
      case 'stack_on_hit':
      case 'amp_per_stack':
      case 'detonate':
      case 'immune':
      case 'heal_aura':
      case 'heal_amp':
      case 'ally_shield':
      case 'barrier':
      case 'delayed_buff':
      case 'threat':
      case 'dot_amp':
      case 'heal_buff':
      case 'riposte_shield':
      case 'team_hot':
      case 'rally_death':
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
  if (extraAttackChance > 0) out.push({ kind: 'extra_attack', chance: extraAttackChance });
  if (contagion > 0) out.push({ kind: 'contagion', chance: contagion });
  for (const m of statMods.values()) {
    if (m.value !== 0) out.push({ kind: 'stat_mod', scope: m.scope, stat: m.stat, value: m.value });
  }
  out.push(...autocasts);
  return out;
}

/**
 * Abilités de combat effectives d'un héros, dérivées de ses nœuds appris. Seuls
 * l'actif équipé et l'ultime équipé sont pris en compte parmi les slots
 * activables ; les procs/auras des passifs s'appliquent toujours.
 */
export function computeAbilities(
  classId: string,
  learned: LearnedSkills,
  loadout?: SkillLoadout,
): Ability[] {
  const { activeId, ultimateId } = resolveLoadout(classId, learned, loadout);
  const specs: Ability[] = [];
  for (const node of allNodes(classId)) {
    if (node.pending || !node.abilities) continue;
    if (!nodeIsEquipped(node, activeId, ultimateId)) continue;
    const rank = learned[node.id] ?? 0;
    if (rank <= 0) continue;
    const r = Math.min(rank, node.maxRank);
    for (const spec of node.abilities) specs.push(buildAbility(spec, r));
  }
  return mergeAbilities(specs);
}

/* -------------------------------------------------- DESCRIPTIONS EXACTES -- */
// Formate les EFFETS CHIFFRÉS d'un nœud à un rang donné, avec la MÊME formule que
// le moteur (`valeur = base + perRank × rang`, cf. buildAbility/computePassives).
// Le joueur lit ainsi les chiffres exacts, sans ambiguïté.

const STATUS_FR: Record<StatusType, string> = {
  poison: 'poison',
  burn: 'feu',
  stun: 'étourdissement',
  weaken: 'affaiblissement',
  taunt: 'provocation',
};

const MARK_FR: Record<MarkType, string> = {
  burn: "d'embrasement",
  arcane: 'arcanique',
};

const PASSIVE_FR: Record<PassiveType, (v: string) => string> = {
  regen: (v) => `Régénère ${v} des PV max chaque tour`,
  shield: (v) => `Réduit les dégâts subis de ${v}`,
  crit: (v) => `${v} de chance de coup critique (×2 dégâts)`,
  venom: (v) => `+${v} de dégâts contre un ennemi déjà blessé`,
  rage: (v) => `+${v} de dégâts sous 50 % de PV`,
  thorns: (v) => `Renvoie ${v} des dégâts subis à l'attaquant`,
  lifesteal: (v) => `Soigne ${v} des dégâts infligés`,
  first_strike: (v) => `+${v} de dégâts au premier tour`,
  dodge: (v) => `${v} de chance d'esquiver une attaque`,
  execute: (v) => `+${v} de dégâts sous 30 % de PV`,
};

/** Fraction → pourcentage lisible (0.155 → « 15,5 % »). */
function pctStr(x: number): string {
  const v = Math.round(x * 1000) / 10;
  return `${v.toString().replace('.', ',')} %`;
}

/** Valeur effective au rang r, identique au moteur (base + perRank × r). */
function atRank(base: number | undefined, per: number | undefined, r: number): number {
  return (base ?? 0) + (per ?? 0) * r;
}

/**
 * Stats effectives d'un héros, pour traduire les % en valeurs concrètes dans les
 * descriptions (ex. « 60 % de l'ATK (90 dmg) »). Optionnel : si absent, on ne
 * montre que le %.
 */
export type EffectStats = { atk: number; def: number; hp: number };

/** ` (90 dmg)` à partir d'un multiplicateur d'ATK, si les stats sont fournies. */
function dmgOf(mult: number, stats?: EffectStats): string {
  return stats ? ` (${Math.round(mult * stats.atk)} dmg)` : '';
}
/** ` (120 PV)` à partir d'une fraction de PV max. */
function pvOf(frac: number, stats?: EffectStats): string {
  return stats ? ` (${Math.round(frac * stats.hp)} PV)` : '';
}
/** ` (+18)` à partir d'une fraction d'une stat donnée. */
function statOf(value: number, stat: 'atk' | 'def' | 'hp', stats?: EffectStats): string {
  if (!stats) return '';
  const s = stat === 'atk' ? stats.atk : stat === 'def' ? stats.def : stats.hp;
  return ` (+${Math.round(value * s)})`;
}

/** Décrit l'action d'un autocast (magnitude fixe, indépendante du rang). */
function describeAction(a: AutocastAction, stats?: EffectStats): string {
  switch (a.type) {
    case 'aoe': {
      let s = `frappe tous les ennemis pour ${pctStr(a.dmgMult)} de l'ATK${dmgOf(a.dmgMult, stats)}`;
      if (a.status) {
        const d = a.statusDuration ?? 0;
        if (a.status === 'poison' || a.status === 'burn')
          s += ` puis applique ${STATUS_FR[a.status]} (${pctStr(a.statusPotency ?? 0)} de l'ATK/tour${dmgOf(a.statusPotency ?? 0, stats)}, ${d} tours)`;
        else if (a.status === 'weaken')
          s += ` puis affaiblit (−${pctStr(a.statusPotency ?? 0)} ATK/DEF, ${d} tours)`;
        else s += ` puis applique ${STATUS_FR[a.status]} (${d} tours)`;
      }
      if (a.mark) s += ` et pose ${a.markStacks ?? 1} marque(s) ${MARK_FR[a.mark]}`;
      return s;
    }
    case 'stun_all':
      return `étourdit tous les ennemis pendant ${a.duration} tours`;
    case 'nuke': {
      let s = `frappe la cible la plus faible pour ${pctStr(a.dmgMult)} de l'ATK${dmgOf(a.dmgMult, stats)}`;
      if (a.status) {
        const d = a.statusDuration ?? 0;
        if (a.status === 'weaken') s += ` et l'affaiblit (−${pctStr(a.statusPotency ?? 0)} ATK/DEF, ${d} tours)`;
        else s += ` et applique ${STATUS_FR[a.status]} (${d} tours)`;
      }
      if (a.mark) s += ` et pose ${a.markStacks ?? 1} marque(s) ${MARK_FR[a.mark]}`;
      return s;
    }
    case 'pct_hp':
      return `inflige ${pctStr(a.pct)} des PV max de la cible (plafonné à ${a.capMult}× ton ATK${stats ? ` = ${Math.round(a.capMult * stats.atk)} dmg` : ''})`;
    case 'multi_hit':
      return `frappe tous les ennemis ${a.hits}× pour ${pctStr(a.dmgMult)} de l'ATK par coup${dmgOf(a.dmgMult, stats)}`;
    case 'detonate_all':
      return `fait exploser les marques de tous les ennemis pour ${pctStr(a.dmgMult)} de l'ATK${dmgOf(a.dmgMult, stats)}`;
    case 'heal_all':
      return `soigne toute l'équipe de ${pctStr(a.pct)} des PV max${pvOf(a.pct, stats)}`;
    case 'extra_turn':
      return `toute l'équipe rejoue une attaque (même les alliés à terre)`;
    case 'execute_strike':
      return `frappe la cible focus pour ${pctStr(a.dmgMult)} de l'ATK${dmgOf(a.dmgMult, stats)} ; exécute sous ${pctStr(a.instakillPct)} de ses PV`;
    case 'buff': {
      const who = a.scope === 'team' ? "à toute l'équipe" : 'à toi';
      const parts: string[] = [];
      if (a.atk) parts.push(`+${pctStr(a.atk)} ATK${statOf(a.atk, 'atk', stats)}`);
      if (a.def) parts.push(`+${pctStr(a.def)} DEF${statOf(a.def, 'def', stats)}`);
      if (a.speed) parts.push(`+${pctStr(a.speed)} vitesse`);
      if (a.dmg) parts.push(`+${pctStr(a.dmg)} dégâts`);
      if (a.reduce) parts.push(`−${pctStr(a.reduce)} dégâts subis`);
      if (a.reflect) parts.push(`renvoie ${pctStr(a.reflect)} des dégâts subis`);
      if (a.thornsMult) parts.push(`épines ×${1 + a.thornsMult}`);
      return `${parts.join(', ')} ${who} pendant ${a.duration} tours`;
    }
  }
  return '';
}

/** Décrit un gabarit d'abilité au rang r (chiffres exacts). */
function describeAbilitySpec(spec: AbilitySpec, r: number, stats?: EffectStats): string {
  const chance = atRank(spec.chance, spec.chancePerRank, r);
  const value = atRank(spec.value, spec.valuePerRank, r);
  const bonus = atRank(spec.bonus, spec.bonusPerRank, r);
  const potency = atRank(spec.potency, spec.potencyPerRank, r);
  const duration = Math.round(atRank(spec.duration, spec.durationPerRank, r));
  switch (spec.kind) {
    case 'armor_pen':
      return `Ignore ${pctStr(value)} de la DEF de la cible au premier coup`;
    case 'on_hit': {
      const st = spec.status ?? 'poison';
      if (st === 'poison' || st === 'burn')
        return `${pctStr(chance)} de chance d'appliquer ${STATUS_FR[st]} : ${pctStr(potency)} de l'ATK par tour${dmgOf(potency, stats)} pendant ${duration} tours`;
      if (st === 'weaken')
        return `${pctStr(chance)} de chance d'affaiblir : −${pctStr(potency)} ATK/DEF pendant ${duration} tours`;
      return `${pctStr(chance)} de chance d'appliquer ${STATUS_FR[st]} pendant ${duration} tours`;
    }
    case 'multi_shot':
      return `${pctStr(chance)} de chance de toucher ${spec.extraTargets ?? 1} ennemi supplémentaire`;
    case 'extra_attack':
      return `${pctStr(chance)} de chance de tirer une seconde flèche (attaque supplémentaire) dans le même tour`;
    case 'amp_vs_status':
      return `+${pctStr(bonus)} de dégâts contre les cibles sous ${STATUS_FR[spec.status ?? 'poison']}`;
    case 'autocast':
      return `Tous les ${Math.max(2, Math.round(atRank(spec.everyRounds ?? 5, spec.everyRoundsPerRank, r)))} tours : ${describeAction(spec.action!, stats)}`;
    case 'revive':
      return `Ressuscite une fois par combat un allié tombé, à ${pctStr(spec.hpPct ?? 0.3)} de ses PV`;
    case 'contagion':
      return `${pctStr(Math.min(1, chance))} de chance que tes DoT se propagent à un autre ennemi`;
    case 'taunt':
      return `Tous les ${spec.everyRounds ?? 5} tours, provoque les ennemis pendant ${duration} tour(s)`;
    case 'stat_mod': {
      const who = (spec.scope ?? 'team') === 'team' ? "toute l'équipe" : 'toi';
      const stat = spec.stat ?? 'atk';
      const statFr = stat === 'atk' ? 'ATK' : stat === 'def' ? 'DEF' : 'PV max';
      return `Aura permanente : +${pctStr(value)} ${statFr} pour ${who}${statOf(value, stat, stats)}`;
    }
    case 'stack_on_hit':
      return `${pctStr(chance)} de poser une marque à l'attaque (max ${spec.max ?? 99})`;
    case 'amp_per_stack':
      return `+${pctStr(bonus)} de dégâts par marque sur la cible`;
    case 'detonate':
      return `À ${spec.threshold ?? 5} marques, la cible explose pour ${pctStr(value)} de l'ATK${dmgOf(value, stats)} (reset des marques)`;
    case 'immune': {
      const list = spec.statuses ? spec.statuses.map((s) => STATUS_FR[s]).join(' / ') : 'un effet négatif';
      return `${pctStr(chance)} de chance d'ignorer ${list}`;
    }
    case 'heal_aura':
      return `Soigne l'allié le plus bas de ${pctStr(value)} de ses PV max chaque tour${pvOf(value, stats)}`;
    case 'heal_amp':
      return `+${pctStr(bonus)} sur tous tes soins`;
    case 'ally_shield':
      return `${pctStr(chance)}/tour de poser une barrière de ${pctStr(spec.pct ?? 0.1)} PV${pvOf(spec.pct ?? 0.1, stats)} sur l'allié le plus faible`;
    case 'barrier':
      return `Barrière régénérée chaque tour, absorbe ${pctStr(value)} de tes PV max${pvOf(value, stats)}`;
    case 'delayed_buff':
      return `Au tour ${spec.afterRounds ?? 12}, +${pctStr(value)} de dégâts à toute l'équipe jusqu'à la fin`;
    case 'threat':
      return `+${pctStr(value)} d'agressivité (les ennemis te ciblent plus souvent)`;
    case 'dot_amp':
      return `+${pctStr(bonus)} de dégâts de ${STATUS_FR[spec.status ?? 'poison']} sur la durée`;
    case 'heal_buff':
      return `Soigner un allié sous 50 % PV lui donne +${pctStr(value)} ATK${statOf(value, 'atk', stats)} pendant ${spec.duration ?? 2} tours`;
    case 'riposte_shield':
      return `Quand ta barrière est brisée, tu renvoies ${pctStr(bonus)} des dégâts à l'attaquant`;
    case 'team_hot':
      return `${pctStr(chance)}/tour de poser un soin sur la durée (${pctStr(spec.pct ?? 0.01)} PV/tour${pvOf(spec.pct ?? 0.01, stats)}, ${spec.duration ?? 3} tours) à l'équipe`;
    case 'rally_death':
      return `À chaque mort sur le champ de bataille (les deux camps), +${pctStr(value)} ATK & DEF — cumulatif, une résurrection puis une nouvelle mort recompte`;
  }
  return '';
}

/** Décrit un passif de combat au rang r. */
function describePassiveSpec(p: PassiveSpec, r: number, stats?: EffectStats): string {
  const frac = atRank(p.value, p.valuePerRank, r);
  const base = PASSIVE_FR[p.type](pctStr(frac));
  // La régén est un % des PV max → on montre la valeur concrète.
  return p.type === 'regen' ? base + pvOf(frac, stats) : base;
}

/**
 * Effets EXACTS d'un nœud à un rang donné (une ligne par effet), chiffres inclus.
 * `rank` est borné à [1, maxRank]. Utilisé par l'UI de l'arbre de compétences.
 */
export function describeNodeEffects(node: SkillNode, rank: number, stats?: EffectStats): string[] {
  const r = Math.max(1, Math.min(rank, node.maxRank));
  const lines: string[] = [];
  for (const p of node.passives ?? []) lines.push(describePassiveSpec(p, r, stats));
  for (const a of node.abilities ?? []) lines.push(describeAbilitySpec(a, r, stats));
  return lines;
}

export type LearnCheck = { ok: boolean; reason?: string };

/** Valide l'achat d'un rang sur `nodeId` (nœud existe, pas pending, cap, prérequis séquentiel, gating capstone). */
export function validateLearn(classId: string, learned: LearnedSkills, nodeId: string): LearnCheck {
  const found = nodeById(classId, nodeId);
  if (!found) return { ok: false, reason: 'Compétence inconnue' };
  const { node, branch } = found;

  if (node.pending) return { ok: false, reason: 'Bientôt disponible' };

  const rank = learned[nodeId] ?? 0;
  if (rank >= node.maxRank) return { ok: false, reason: 'Rang maximum atteint' };

  // Progression séquentielle : le nœud précédent de la branche doit avoir ≥ 1 rang.
  const nodes = skillTreeFor(classId).find((b) => b.id === branch)?.nodes ?? [];
  const idx = nodes.findIndex((n) => n.id === nodeId);
  if (idx > 0) {
    const prev = nodes[idx - 1]!;
    if ((learned[prev.id] ?? 0) < 1) return { ok: false, reason: `Débloque d'abord « ${prev.name} »` };
  }

  // Capstone : l'ultime exige aussi un investissement minimum dans sa branche.
  if (node.slot === 'ultimate' && branchPoints(classId, learned, branch) < ULTIMATE_GATE) {
    return { ok: false, reason: `Investis ${ULTIMATE_GATE} points dans cette branche` };
  }
  return { ok: true };
}

/**
 * Valide l'équipement d'un actif ou d'un ultime : le nœud doit appartenir à la
 * classe, être du bon slot et avoir été appris (rang ≥ 1). `nodeId === null`
 * (déséquiper) est toujours accepté.
 */
export function validateSelect(
  classId: string,
  learned: LearnedSkills,
  slot: 'active' | 'ultimate',
  nodeId: string | null,
): LearnCheck {
  if (nodeId === null) return { ok: true };
  const found = nodeById(classId, nodeId);
  if (!found) return { ok: false, reason: 'Compétence inconnue' };
  if (found.node.slot !== slot) return { ok: false, reason: 'Emplacement incorrect' };
  if ((learned[nodeId] ?? 0) < 1) return { ok: false, reason: 'Compétence non apprise' };
  return { ok: true };
}
