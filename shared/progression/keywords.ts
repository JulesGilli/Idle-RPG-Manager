/**
 * LEXIQUE DES EFFETS — le vocabulaire commun du jeu.
 *
 * Le moteur de combat compte plus de cinquante `kind` d'abilités et dix
 * `PassiveType`. Chacun avait sa propre phrase d'explication, écrite à l'endroit
 * où il s'affichait : l'arbre de compétences disait « renvoie 15 % des dégâts »,
 * la fiche de héros « Épines », un set « riposte », et rien ne laissait deviner
 * qu'il s'agissait de la même mécanique. Un joueur ne pouvait donc pas repérer
 * ses synergies : il fallait lire chaque description en entier et faire le
 * rapprochement soi-même.
 *
 * Ce module donne UN mot-clé par mécanique, et une seule définition par mot-clé.
 * Les écrans (arbre de compétences, fiche de héros, encyclopédie) affichent la
 * même étiquette pour la même chose, et le joueur apprend le mot une fois.
 *
 * ⚠️ Un mot-clé ne remplace PAS le texte détaillé (les chiffres, eux, dépendent
 * du rang et de l'objet) : il l'étiquette. Les deux cohabitent à l'écran.
 */

import type { Ability, PassiveType } from '../combat/types.ts';

/** Familles d'effets — pilote la couleur d'affichage, rien d'autre. */
export type KeywordFamily = 'offense' | 'defense' | 'soutien' | 'controle';

export const FAMILY_COLOR: Record<KeywordFamily, string> = {
  offense: '#fb7185',
  defense: '#56b6f4',
  soutien: '#5fd39b',
  controle: '#a78bfa',
};

export type Keyword = {
  id: string;
  label: string;
  icon: string;
  family: KeywordFamily;
  /** Définition en une phrase — la MÊME partout où le mot apparaît. */
  desc: string;
};

const K = (
  id: string,
  label: string,
  icon: string,
  family: KeywordFamily,
  desc: string,
): Keyword => ({ id, label, icon, family, desc });

/** Le lexique, dans l'ordre d'affichage de l'encyclopédie. */
export const KEYWORDS: Keyword[] = [
  /* -------------------------------------------------------------- DÉFENSE */
  K('egide', 'Égide', '🛡️', 'defense', 'Réduit d’un pourcentage TOUS les dégâts subis, en permanence.'),
  K('barriere', 'Barrière', '🔷', 'defense', 'Absorbe des dégâts avant les PV. Ce qu’elle encaisse ne coûte rien à la cible.'),
  K('epines', 'Épines', '🌵', 'defense', 'Renvoie une part des dégâts subis à l’attaquant. Sans coup encaissé, aucun renvoi.'),
  K('esquive', 'Esquive', '💨', 'defense', 'Chance d’annuler complètement une attaque reçue.'),
  K('immunite', 'Immunité', '🚫', 'defense', 'Chance d’ignorer un statut négatif au moment où il est appliqué.'),

  /* -------------------------------------------------------------- OFFENSE */
  K('critique', 'Critique', '⚡', 'offense', 'Chance de doubler les dégâts d’un coup. Plafonnée en combat.'),
  K('penetration', 'Pénétration', '🪓', 'offense', 'Ignore une part de la DEF de la cible : les gros défenseurs cessent d’absorber.'),
  K('execution', 'Exécution', '☠️', 'offense', 'Dégâts majorés contre une cible déjà très basse en PV.'),
  K('venin', 'Venin', '🐍', 'offense', 'Dégâts majorés contre une cible qui n’est plus à PV pleins.'),
  K('fureur', 'Fureur', '🔥', 'offense', 'Tu frappes d’autant plus fort que TU es blessé — souvent contre un prix à payer.'),
  K('foudre', 'Foudre', '🌩️', 'offense', 'Bonus qui ne vaut qu’à l’ouverture du combat (1re manche / 1er coup).'),
  K('frappe_bonus', 'Frappe bonus', '🗡️', 'offense', 'Coups SUPPLÉMENTAIRES dans le même tour (2e attaque, cible en plus, frappe enchaînée).'),
  K('amplification', 'Amplification', '🔺', 'offense', 'Augmente les dégâts d’une catégorie, d’une stat ou de toute l’équipe.'),

  /* ------------------------------------------------------------- CONTRÔLE */
  K('alteration', 'Altération', '🧪', 'controle', 'Statut négatif posé sur la cible (poison, brûlure, étourdissement, affaiblissement).'),
  K('marque', 'Marque', '🎯', 'controle', 'Compteur cumulable posé sur une cible ; d’autres effets en tirent leur puissance.'),
  K('propagation', 'Propagation', '⛓️', 'controle', 'Ce que subit une cible se répercute sur les autres ennemis.'),
  K('provocation', 'Provocation', '📢', 'controle', 'Force les ennemis à te cibler — tu encaisses à la place de l’équipe.'),
  K('dissipation', 'Dissipation', '🌀', 'controle', 'Retire un bienfait ou des marques à la cible.'),

  /* -------------------------------------------------------------- SOUTIEN */
  K('soin', 'Soin', '✨', 'soutien', 'Rend des PV à un allié, ou augmente les soins que tu émets.'),
  K('regeneration', 'Régénération', '🌿', 'soutien', 'PV rendus AUTOMATIQUEMENT à chaque tour, sans action.'),
  K('vampirisme', 'Vampirisme', '🩸', 'soutien', 'Une part des dégâts infligés se transforme en soins.'),
  K('resurrection', 'Résurrection', '🕊️', 'soutien', 'Relève un combattant tombé, une seule fois par combat.'),
  K('invocation', 'Invocation', '💀', 'soutien', 'Ajoute des créatures alliées au combat. Sans invocation, les effets qui les visent ne font rien.'),
  K('celerite', 'Célérité', '⏱️', 'soutien', 'Raccourcit les temps de recharge : tes actifs reviennent plus vite.'),
  K('automatisme', 'Automatisme', '🔁', 'soutien', 'Se déclenche tout seul à intervalle régulier, sans que tu aies à le lancer.'),
];

const BY_ID = new Map(KEYWORDS.map((k) => [k.id, k]));

export function keywordById(id: string): Keyword | undefined {
  return BY_ID.get(id);
}

/** Mots-clés d'une liste d'ids, dans l'ordre du lexique et sans doublon. */
export function keywordsOf(ids: readonly string[]): Keyword[] {
  const wanted = new Set(ids);
  return KEYWORDS.filter((k) => wanted.has(k.id));
}

/* ------------------------------------------------------------- MAPPINGS -- */

/**
 * Passif de combat → mot-clé. Bijection : chaque `PassiveType` a son mot.
 * (`PASSIVE_META` porte déjà ces libellés côté joaillerie ; le test
 * `keywords.test.ts` verrouille l'égalité des deux, pour qu'une gemme et un
 * nœud d'arbre ne nomment jamais différemment le même effet.)
 */
export const PASSIVE_KEYWORD: Record<PassiveType, string> = {
  shield: 'egide',
  thorns: 'epines',
  dodge: 'esquive',
  crit: 'critique',
  execute: 'execution',
  venom: 'venin',
  rage: 'fureur',
  first_strike: 'foudre',
  regen: 'regeneration',
  lifesteal: 'vampirisme',
};

/**
 * Abilité → mots-clés. Une abilité peut en porter plusieurs (une invocation qui
 * empoisonne relève de l'invocation ET de l'altération).
 *
 * `inert` est délibérément absent : c'est le marqueur d'un effet neutralisé, il
 * n'y a rien à étiqueter. Le test d'exhaustivité l'exempte nommément.
 */
export const ABILITY_KEYWORDS: Record<string, string[]> = {
  /* défense */
  barrier: ['barriere'],
  ally_shield: ['barriere', 'soin'],
  riposte_shield: ['barriere', 'epines'],
  riposte_dodge: ['esquive', 'epines'],
  vengeance: ['epines'],
  immune: ['immunite'],

  /* offense */
  armor_pen: ['penetration'],
  extra_attack: ['frappe_bonus'],
  multi_shot: ['frappe_bonus'],
  bonus_strike: ['frappe_bonus'],
  double_strike: ['frappe_bonus'],
  hp_strike: ['frappe_bonus'],
  reckless: ['fureur'],
  blood_pact: ['fureur', 'vampirisme'],
  on_first_hit: ['foudre', 'alteration'],
  dmg_type_amp: ['amplification'],
  stat_mod: ['amplification'],
  def_to_atk: ['amplification'],
  delayed_buff: ['amplification'],
  rally_death: ['amplification'],
  atk_ramp: ['amplification'],
  amp_vs_buff: ['amplification'],
  amp_vs_status: ['amplification', 'alteration'],
  dot_amp: ['amplification', 'alteration'],

  /* contrôle */
  on_hit: ['alteration'],
  contagion: ['alteration', 'propagation'],
  oath_link: ['propagation'],
  taunt: ['provocation'],
  threat: ['provocation'],
  stack_on_hit: ['marque'],
  amp_per_stack: ['marque', 'amplification'],
  stack_cap_mult: ['marque'],
  detonate: ['marque'],
  amplify_marks: ['marque', 'amplification'],
  purge: ['dissipation'],
  purge_stack: ['dissipation', 'marque'],

  /* soutien */
  heal_aura: ['soin', 'regeneration'],
  heal_amp: ['soin'],
  heal_buff: ['soin', 'amplification'],
  team_hot: ['soin', 'regeneration'],
  heal_convert: ['soin'],
  drain_aura: ['vampirisme', 'soin'],
  revive: ['resurrection'],
  cdr: ['celerite'],
  autocast: ['automatisme'],
  summon: ['invocation'],
  summon_extra: ['invocation'],
  summon_pool: ['invocation'],
  summon_buff: ['invocation', 'amplification'],
  summon_explode: ['invocation'],
  summon_on_hit: ['invocation', 'alteration'],
  explode_on_death: ['invocation'],
  bone_stack: ['invocation', 'marque'],
  bone_ritual: ['invocation'],
};

/** Mots-clés d'une abilité (ou d'un `kind` seul, pour les specs d'arbre). */
export function abilityKeywords(kind: Ability['kind'] | string): Keyword[] {
  return keywordsOf(ABILITY_KEYWORDS[kind] ?? []);
}

/** Mots-clés d'un passif de combat. */
export function passiveKeyword(type: PassiveType): Keyword | undefined {
  return keywordById(PASSIVE_KEYWORD[type]);
}

/**
 * Mots-clés d'un ensemble d'effets (nœud d'arbre, set, objet) — dédoublonnés et
 * rangés dans l'ordre du lexique, pour que deux nœuds qui portent les mêmes
 * mécaniques affichent leurs chips dans le même ordre.
 */
export function keywordsForEffects(
  abilityKinds: readonly (Ability['kind'] | string)[],
  passiveTypes: readonly PassiveType[] = [],
): Keyword[] {
  const ids = new Set<string>();
  for (const k of abilityKinds) for (const id of ABILITY_KEYWORDS[k] ?? []) ids.add(id);
  for (const p of passiveTypes) ids.add(PASSIVE_KEYWORD[p]);
  return keywordsOf([...ids]);
}
