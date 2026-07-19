/**
 * SETS D'ENSEMBLE par CATÉGORIE DE POIDS (lourd / moyen / léger). Le modèle d'arme
 * fixe le poids → donc les classes cibles. Chaque set :
 *   • 2 pièces → un bonus de STATS,
 *   • 4 pièces (set complet) → un EFFET DE COMBAT spécial (la vraie récompense).
 *
 * Les pièces suivent la MÊME logique que les items de base : leurs stats SCALENT
 * avec le matériau de zone choisi au craft (plus la zone est haute, plus c'est fort).
 * Pur et partagé front + Edge Function.
 */
import type { Ability } from '../combat/types.ts';
import type { ItemWeight } from './loot.ts';
import { RARITY_MULT, CLASS_ALLOWED_WEIGHTS } from './loot.ts';
import { zoneMaterialCost, type ForgeMaterialTheme } from './forge.ts';

export type SetStatBonus = { atk: number; def: number; hp: number };
export type SlotType = 'weapon' | 'armor' | 'jewel' | 'relic';

export type ItemSet = {
  id: string;
  name: string;
  theme: string;
  /** Bonus de stats dès 2 pièces équipées. */
  bonus2: SetStatBonus;
  /** Effet de combat accordé quand le set est complet (voir `effectAt`). */
  abilities4: Ability[];
  /**
   * Poids d'armure/arme auxquels le set est RÉSERVÉ (restriction de classe). Un
   * héros n'en tire aucun bonus si les poids autorisés de sa classe ne croisent
   * pas ceux du set. Ex. Colosse = ['heavy'] → paladin/guerrier uniquement.
   */
  weights: ItemWeight[];
  /**
   * Nombre de pièces pour débloquer l'effet. Défaut 4 (grands sets classiques).
   * Les « petits sets » utilitaires (2 pièces universelles) mettent 2.
   */
  effectAt?: number;
  /** Set introduit en V1.1 : masqué/refusé à la forge avant la sortie. */
  gatedUntilRelease?: boolean;
};

/** Nombre de pièces requis pour l'effet complet d'un set. */
export function setEffectAt(set: ItemSet): number {
  return set.effectAt ?? 4;
}

/** La pièce appartient-elle à un set encore verrouillé (sortie V1.1) ? */
export function setPieceGated(pieceId: string): boolean {
  const piece = SET_PIECES.find((p) => p.id === pieceId);
  const set = piece ? setById(piece.setId) : undefined;
  return Boolean(set?.gatedUntilRelease);
}

const ZERO: SetStatBonus = { atk: 0, def: 0, hp: 0 };
const b = (o: Partial<SetStatBonus>): SetStatBonus => ({ ...ZERO, ...o });

export const SETS: ItemSet[] = [
  {
    id: 'colosse',
    name: 'Panoplie du Colosse',
    theme: 'Lourd — le tank qui frappe avec sa masse de vie',
    bonus2: b({ hp: 250 }),
    weights: ['heavy'],
    // +20 % des PV max en dégâts bonus à chaque attaque.
    abilities4: [{ kind: 'hp_strike', value: 0.2 }],
  },
  {
    id: 'duelliste',
    name: 'Parure du Duelliste',
    theme: 'Moyen / léger — deux frappes par tour, idéal pour poser des malus',
    bonus2: b({ atk: 40 }),
    weights: ['medium', 'light'],
    // Une 2e attaque chaque tour, mais chaque frappe à 60 % des dégâts (−40 %).
    abilities4: [{ kind: 'double_strike', mult: 0.6 }],
  },
  {
    id: 'tacticien',
    name: 'Atours du Tacticien',
    theme: 'Léger — les actifs tombent plus vite',
    bonus2: b({ atk: 30 }),
    weights: ['light'],
    // −1 tour de cooldown sur tous les actifs (autocasts & provocation).
    abilities4: [{ kind: 'cdr', value: 1 }],
  },

  /* ---- Petits sets utilitaires (V1.1) : 2 pièces universelles (bijou+relique),
     effet dès 2 pièces, UNIVERSELS, mixables.

     Ils étaient restreints par poids alors que leurs deux pièces sont des BIJOUX
     et des RELIQUES — des slots qui n'ont pas de poids du tout (`weight: null`) et
     que n'importe quelle classe peut porter. Un joueur pouvait donc forger le set,
     l'équiper entièrement… et ne recevoir aucun bonus, sans que rien ne le lui
     indique. La restriction n'avait aucun sens ici : elle existe pour les GRANDS
     sets, dont les armes et armures sont réellement typées par poids. ---- */
  {
    id: 'provocateur',
    name: 'Parure du Provocateur',
    theme: 'Tank — attire le feu ennemi sur toi',
    bonus2: b({ def: 30, hp: 150 }),
    weights: ['light', 'medium', 'heavy'],
    abilities4: [{ kind: 'threat', value: 6 }],
    effectAt: 2,
    gatedUntilRelease: true,
  },
  {
    id: 'ame_offerte',
    name: "Parure de l'Âme Offerte",
    theme: 'Soigneur offensif — la moitié de tes soins blesse l’ennemi',
    bonus2: b({ atk: 25, hp: 100 }),
    weights: ['light', 'medium', 'heavy'],
    abilities4: [{ kind: 'heal_convert', ratio: 0.5 }],
    effectAt: 2,
    gatedUntilRelease: true,
  },
  {
    id: 'pyromane',
    name: 'Parure du Pyromane',
    theme: 'Feu — amplifie tes dégâts de feu',
    bonus2: b({ atk: 30 }),
    weights: ['light', 'medium', 'heavy'],
    abilities4: [{ kind: 'dmg_type_amp', damageType: 'fire', value: 0.35 }],
    effectAt: 2,
    gatedUntilRelease: true,
  },
  {
    id: 'empoisonneur',
    name: "Parure de l'Empoisonneur",
    theme: 'Poison — amplifie tes dégâts de poison',
    bonus2: b({ atk: 30 }),
    weights: ['light', 'medium', 'heavy'],
    abilities4: [{ kind: 'dmg_type_amp', damageType: 'poison', value: 0.35 }],
    effectAt: 2,
    gatedUntilRelease: true,
  },
  {
    id: 'arcaniste',
    name: "Parure de l'Arcaniste",
    theme: 'Arcane — amplifie tes dégâts arcaniques',
    bonus2: b({ atk: 30 }),
    weights: ['light', 'medium', 'heavy'],
    abilities4: [{ kind: 'dmg_type_amp', damageType: 'arcane', value: 0.35 }],
    effectAt: 2,
    gatedUntilRelease: true,
  },
  {
    id: 'brute',
    name: 'Parure de la Brute',
    theme: 'Physique — amplifie tes dégâts physiques',
    bonus2: b({ atk: 30 }),
    weights: ['light', 'medium', 'heavy'],
    abilities4: [{ kind: 'dmg_type_amp', damageType: 'physical', value: 0.35 }],
    effectAt: 2,
    gatedUntilRelease: true,
  },
];

export function setById(id: string | null | undefined): ItemSet | undefined {
  return id ? SETS.find((s) => s.id === id) : undefined;
}

/**
 * Une pièce de set : profil de stats (bias) + slot + poids. Les stats concrètes
 * sont calculées au craft à partir du matériau choisi (cf. `craftSetPieceStats`).
 */
export type SetPieceRecipe = {
  id: string;
  setId: string;
  slot: SlotType;
  label: string;
  /** Poids (arme/armure) → contrainte de classe ; null = universel (bijou/relique). */
  weight: ItemWeight | null;
  /** Bias de stats (multiplicateurs) — appliqués à la magnitude du matériau. */
  bias: SetStatBonus;
  /** Matériaux d'expédition SIGNATURE (en plus du matériau de zone choisi). */
  materials: { key: string; qty: number }[];
};

export const SET_PIECES: SetPieceRecipe[] = [
  // Panoplie du Colosse — LOURD (marteau) → guerrier / paladin
  { id: 'colosse_weapon', setId: 'colosse', slot: 'weapon', weight: 'heavy', label: 'Marteau du Colosse', bias: b({ atk: 1.1, def: 0.4, hp: 0.6 }), materials: [{ key: 'minerai_stellaire', qty: 5 }, { key: 'eclat_du_noyau', qty: 2 }] },
  { id: 'colosse_armor', setId: 'colosse', slot: 'armor', weight: 'heavy', label: 'Armure du Colosse', bias: b({ def: 1.2, hp: 1.0 }), materials: [{ key: 'minerai_stellaire', qty: 6 }, { key: 'eclat_du_noyau', qty: 1 }] },
  { id: 'colosse_jewel', setId: 'colosse', slot: 'jewel', weight: null, label: 'Sceau du Colosse', bias: b({ def: 0.6, hp: 0.9 }), materials: [{ key: 'gemme_brute', qty: 4 }] },
  { id: 'colosse_relic', setId: 'colosse', slot: 'relic', weight: null, label: 'Cœur du Colosse', bias: b({ def: 0.8, hp: 1.1 }), materials: [{ key: 'eclat_du_noyau', qty: 2 }, { key: 'minerai_stellaire', qty: 3 }] },
  // Parure du Duelliste — MOYEN (épée) → guerrier / archer
  { id: 'duelliste_weapon', setId: 'duelliste', slot: 'weapon', weight: 'medium', label: 'Épée du Duelliste', bias: b({ atk: 1.2, def: 0.3, hp: 0.4 }), materials: [{ key: 'poussiere_arcane', qty: 5 }, { key: 'tablette_oubliee', qty: 2 }] },
  { id: 'duelliste_armor', setId: 'duelliste', slot: 'armor', weight: 'medium', label: 'Cuirasse du Duelliste', bias: b({ atk: 0.4, def: 0.8, hp: 0.7 }), materials: [{ key: 'poussiere_arcane', qty: 6 }, { key: 'relique_noyee', qty: 1 }] },
  { id: 'duelliste_jewel', setId: 'duelliste', slot: 'jewel', weight: null, label: 'Anneau du Duelliste', bias: b({ atk: 0.8, hp: 0.4 }), materials: [{ key: 'tablette_oubliee', qty: 4 }] },
  { id: 'duelliste_relic', setId: 'duelliste', slot: 'relic', weight: null, label: 'Fanion du Duelliste', bias: b({ atk: 1.0, def: 0.2, hp: 0.5 }), materials: [{ key: 'relique_noyee', qty: 2 }, { key: 'poussiere_arcane', qty: 3 }] },
  // Atours du Tacticien — LÉGER (sceptre) → archer / mage / soigneur
  { id: 'tacticien_weapon', setId: 'tacticien', slot: 'weapon', weight: 'light', label: 'Sceptre du Tacticien', bias: b({ atk: 1.1, def: 0.2, hp: 0.4 }), materials: [{ key: 'seve_primordiale', qty: 5 }, { key: 'ambre_vivant', qty: 2 }] },
  { id: 'tacticien_armor', setId: 'tacticien', slot: 'armor', weight: 'light', label: 'Voile du Tacticien', bias: b({ atk: 0.5, def: 0.5, hp: 0.6 }), materials: [{ key: 'seve_primordiale', qty: 6 }, { key: 'coeur_sylve_ancien', qty: 1 }] },
  { id: 'tacticien_jewel', setId: 'tacticien', slot: 'jewel', weight: null, label: 'Talisman du Tacticien', bias: b({ atk: 0.9, hp: 0.3 }), materials: [{ key: 'ambre_vivant', qty: 4 }] },
  { id: 'tacticien_relic', setId: 'tacticien', slot: 'relic', weight: null, label: 'Grimoire du Tacticien', bias: b({ atk: 0.8, def: 0.3, hp: 0.5 }), materials: [{ key: 'coeur_sylve_ancien', qty: 2 }, { key: 'seve_primordiale', qty: 3 }] },

  // ---- Petits sets utilitaires (V1.1) : 2 pièces universelles chacun ----
  { id: 'provocateur_jewel', setId: 'provocateur', slot: 'jewel', weight: null, label: 'Sceau du Provocateur', bias: b({ def: 0.6, hp: 0.8 }), materials: [{ key: 'seve_primordiale', qty: 3 }] },
  { id: 'provocateur_relic', setId: 'provocateur', slot: 'relic', weight: null, label: 'Étendard du Provocateur', bias: b({ def: 0.7, hp: 0.9 }), materials: [{ key: 'ambre_vivant', qty: 3 }] },

  { id: 'ame_offerte_jewel', setId: 'ame_offerte', slot: 'jewel', weight: null, label: "Camée de l'Âme Offerte", bias: b({ atk: 0.5, hp: 0.4 }), materials: [{ key: 'seve_primordiale', qty: 3 }] },
  { id: 'ame_offerte_relic', setId: 'ame_offerte', slot: 'relic', weight: null, label: "Calice de l'Âme Offerte", bias: b({ atk: 0.4, hp: 0.6 }), materials: [{ key: 'ambre_vivant', qty: 3 }] },

  { id: 'pyromane_jewel', setId: 'pyromane', slot: 'jewel', weight: null, label: 'Rubis du Pyromane', bias: b({ atk: 0.6, hp: 0.3 }), materials: [{ key: 'seve_primordiale', qty: 3 }] },
  { id: 'pyromane_relic', setId: 'pyromane', slot: 'relic', weight: null, label: 'Braséro du Pyromane', bias: b({ atk: 0.5, def: 0.2, hp: 0.4 }), materials: [{ key: 'coeur_sylve_ancien', qty: 2 }] },

  { id: 'empoisonneur_jewel', setId: 'empoisonneur', slot: 'jewel', weight: null, label: "Fiole de l'Empoisonneur", bias: b({ atk: 0.6, hp: 0.3 }), materials: [{ key: 'seve_primordiale', qty: 3 }] },
  { id: 'empoisonneur_relic', setId: 'empoisonneur', slot: 'relic', weight: null, label: "Grimoire de l'Empoisonneur", bias: b({ atk: 0.5, def: 0.2, hp: 0.4 }), materials: [{ key: 'ambre_vivant', qty: 3 }] },

  { id: 'arcaniste_jewel', setId: 'arcaniste', slot: 'jewel', weight: null, label: "Gemme de l'Arcaniste", bias: b({ atk: 0.6, hp: 0.3 }), materials: [{ key: 'seve_primordiale', qty: 3 }] },
  { id: 'arcaniste_relic', setId: 'arcaniste', slot: 'relic', weight: null, label: "Codex de l'Arcaniste", bias: b({ atk: 0.5, def: 0.2, hp: 0.4 }), materials: [{ key: 'coeur_sylve_ancien', qty: 2 }] },

  { id: 'brute_jewel', setId: 'brute', slot: 'jewel', weight: null, label: 'Chaîne de la Brute', bias: b({ atk: 0.6, hp: 0.3 }), materials: [{ key: 'ambre_vivant', qty: 3 }] },
  { id: 'brute_relic', setId: 'brute', slot: 'relic', weight: null, label: 'Totem de la Brute', bias: b({ atk: 0.5, def: 0.2, hp: 0.4 }), materials: [{ key: 'coeur_sylve_ancien', qty: 2 }] },
];

/**
 * Où se forge chaque pièce de set. Un atelier ne propose QUE ses slots : la
 * Forge fait les armes et les armures, la Joaillerie les bijoux, l'Autel les
 * reliques. (L'action serveur `craft_set` est commune aux trois — c'est donc à
 * chaque atelier de ne présenter que ce qui le concerne.)
 */
export const WORKSHOP_SLOTS = {
  forge: ['weapon', 'armor'],
  jewelry: ['jewel'],
  altar: ['relic'],
} as const satisfies Record<string, readonly SlotType[]>;

export type Workshop = keyof typeof WORKSHOP_SLOTS;

/** Pièces de set forgeables dans un atelier donné. */
export function setPiecesForWorkshop(workshop: Workshop): SetPieceRecipe[] {
  const slots = WORKSHOP_SLOTS[workshop] as readonly SlotType[];
  return SET_PIECES.filter((p) => slots.includes(p.slot));
}

/**
 * Atelier responsable d'un type d'objet — pour le craft ET pour l'amélioration.
 * C'est lui qui décide quelle maîtrise s'applique : renforcer une arme relève de
 * la forge, une relique de l'autel, raffiner un bijou de la joaillerie.
 */
export function workshopOfItemType(itemType: string): Workshop | null {
  for (const [workshop, slots] of Object.entries(WORKSHOP_SLOTS)) {
    if ((slots as readonly string[]).includes(itemType)) return workshop as Workshop;
  }
  return null;
}

export function setPieceById(id: string): SetPieceRecipe | undefined {
  return SET_PIECES.find((p) => p.id === id);
}

/** Prime de puissance des pièces de set (× la magnitude du matériau de zone). */
const SET_MAGNITUDE_MULT = 1.6;

/**
 * Stats concrètes d'une pièce de set forgée avec `mat` : elles SCALENT avec la
 * magnitude du matériau (comme un item de base). Rareté fixe « ultime » (endgame).
 * Les PV sont sur l'échelle ~×2 habituelle.
 */
export function craftSetPieceStats(piece: SetPieceRecipe, mat: ForgeMaterialTheme): SetStatBonus {
  const base = Math.max(1, mat.magnitude * SET_MAGNITUDE_MULT) * RARITY_MULT.ultimate;
  return {
    atk: Math.round(base * piece.bias.atk),
    def: Math.round(base * piece.bias.def),
    hp: Math.round(base * piece.bias.hp * 2),
  };
}

/* ------------------------------------------------------ RECETTE COMPOSÉE -- */
// Une pièce de set réunit : le matériau de ZONE choisi (puissance) + les matériaux
// d'EXPÉDITION signature + un composant de BOSS (l'ensemble) + un matériau de DONJON.

type Mat = { key: string; qty: number };

/** Composant de boss signature de chaque ensemble. */
export const SET_BOSS_COMPONENT: Record<string, string> = {
  colosse: 'fragment_titan',
  duelliste: 'encre_kraken',
  tacticien: 'coeur_sylve',
};

/** Matériau de donjon requis par toute pièce de set. */
export const SET_DUNGEON_MATERIAL: Mat = { key: 'sceau_catacombe', qty: 1 };
/** Or ajouté au coût du matériau de zone pour une pièce de set. */
const SET_GOLD_PREMIUM = 1500;

function mergeMaterials(mats: Mat[]): Mat[] {
  const acc = new Map<string, number>();
  for (const m of mats) acc.set(m.key, (acc.get(m.key) ?? 0) + m.qty);
  return [...acc].map(([key, qty]) => ({ key, qty }));
}

/** Recette complète d'une pièce de set pour le matériau de zone `mat` choisi. */
export function setPieceRecipe(
  piece: SetPieceRecipe,
  mat: ForgeMaterialTheme,
): { gold: number; materials: Mat[] } {
  const boss = SET_BOSS_COMPONENT[piece.setId];
  return {
    gold: mat.gold + SET_GOLD_PREMIUM,
    materials: mergeMaterials([
      // farm + essence du boss de la zone : une pièce de set ne choisit pas son
      // essence (apanage de la forge), elle paie celle de sa zone comme avant.
      ...zoneMaterialCost(mat),
      ...piece.materials,
      ...(boss ? [{ key: boss, qty: 1 }] : []),
      SET_DUNGEON_MATERIAL,
    ]),
  };
}

/* --------------------------------------------------------- BONUS & EFFETS -- */

function countSets(equippedSetIds: (string | null | undefined)[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of equippedSetIds) if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
  return counts;
}

/**
 * La classe peut-elle bénéficier de ce set ? Vrai si les poids autorisés de la
 * classe croisent les poids du set. `classId` omis → aucune restriction (repli).
 */
export function classCanUseSet(set: ItemSet, classId?: string | null): boolean {
  if (!classId) return true;
  const allowed = CLASS_ALLOWED_WEIGHTS[classId] ?? ['light', 'medium', 'heavy'];
  return set.weights.some((w) => allowed.includes(w));
}

/**
 * Bonus de STATS des sets à ≥2 pièces équipées. Si `classId` est fourni, les sets
 * dont le poids ne convient pas à la classe sont IGNORÉS (restriction de classe).
 */
export function computeSetBonuses(
  equippedSetIds: (string | null | undefined)[],
  classId?: string | null,
): SetStatBonus {
  const total: SetStatBonus = { atk: 0, def: 0, hp: 0 };
  for (const [sid, cnt] of countSets(equippedSetIds)) {
    const set = setById(sid);
    if (!set || cnt < 2 || !classCanUseSet(set, classId)) continue;
    total.atk += set.bonus2.atk;
    total.def += set.bonus2.def;
    total.hp += set.bonus2.hp;
  }
  return total;
}

/** Capacités de combat des sets COMPLETS — à injecter dans `abilities`. */
export function computeSetAbilities(
  equippedSetIds: (string | null | undefined)[],
  classId?: string | null,
): Ability[] {
  const out: Ability[] = [];
  for (const [sid, cnt] of countSets(equippedSetIds)) {
    const set = setById(sid);
    if (set && cnt >= setEffectAt(set) && classCanUseSet(set, classId)) out.push(...set.abilities4);
  }
  return out;
}

/** Description texte d'une capacité de set (pour l'UI). */
const DMG_TYPE_LABEL: Record<string, string> = {
  physical: 'physiques',
  magical: 'magiques',
  fire: 'de feu',
  poison: 'de poison',
  arcane: 'arcaniques',
};

function describeSetAbility(a: Ability): string {
  switch (a.kind) {
    case 'hp_strike':
      return `À l'attaque : +${Math.round(a.value * 100)} % des PV max en dégâts bonus.`;
    case 'double_strike':
      return `Une 2e attaque chaque tour ; chaque frappe à ${Math.round(a.mult * 100)} % des dégâts.`;
    case 'cdr':
      return `−${a.value} tour de cooldown sur tous les actifs.`;
    case 'threat':
      return `Attire fortement les attaques ennemies sur toi (menace ×${a.value + 1}).`;
    case 'dmg_type_amp':
      return `+${Math.round(a.value * 100)} % de dégâts ${DMG_TYPE_LABEL[a.damageType] ?? a.damageType}.`;
    case 'heal_convert':
      return `Soins émis : ${Math.round((1 - a.ratio) * 100)} % aux alliés, ${Math.round(a.ratio * 100)} % en dégâts sur un ennemi aléatoire.`;
    default:
      return 'Effet spécial.';
  }
}

/** Effet du set COMPLET (4 pièces), en toutes lettres. */
export function describeSetEffect(set: ItemSet): string {
  return set.abilities4.map(describeSetAbility).join(' ; ');
}

/** Détail des sets actifs (≥2 pièces) pour l'affichage UI. `usable` = la classe
 *  du porteur peut en bénéficier (poids compatible) ; sinon le set est inerte. */
export type ActiveSet = { set: ItemSet; count: number; usable: boolean };
export function activeSets(
  equippedSetIds: (string | null | undefined)[],
  classId?: string | null,
): ActiveSet[] {
  const out: ActiveSet[] = [];
  for (const [sid, count] of countSets(equippedSetIds)) {
    const set = setById(sid);
    if (set && count >= 2) out.push({ set, count, usable: classCanUseSet(set, classId) });
  }
  return out;
}
