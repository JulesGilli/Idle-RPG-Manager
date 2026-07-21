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
import {
  FORGE_MATERIALS,
  materialZoneOfCraftCost,
  zoneMaterialCost,
  type ForgeMaterialTheme,
} from './forge.ts';
import { tierGearMult } from './arc.ts';

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
   * Poids auxquels le set est RÉSERVÉ. Un héros dont la classe n'autorise aucun
   * de ces poids porte les pièces mais n'en tire aucun bonus (`classCanUseSet`).
   * Ex. Colosse = ['heavy'] → paladin/inquisiteur.
   *
   * Les trois poids = set universel. C'est le cas des petits sets 2 pièces, faits
   * d'un bijou et d'une relique : des slots sans poids, qu'aucune classe ne se
   * voit refuser à l'équipement — les restreindre serait incohérent.
   */
  weights: ItemWeight[];
  /**
   * Nombre de pièces pour débloquer l'effet. Défaut 4 (grands sets classiques).
   * Les « petits sets » utilitaires (2 pièces universelles) mettent 2.
   */
  effectAt?: number;
  /** Set introduit en V1.1 : masqué/refusé à la forge avant la sortie. */
  gatedUntilRelease?: boolean;
  /**
   * Arc auquel ce set est RÉSERVÉ (défaut 1). Un set d'arc N n'est forgeable que
   * quand `player_arc.current_arc === N` — jamais avant, jamais après. Chaque arc a
   * son propre catalogue de sets : passer à l'arc suivant change les stratégies
   * disponibles au lieu de les empiler.
   */
  arc?: number;
};

/** Arc auquel un set est réservé (1 par défaut). */
export function setArc(set: ItemSet): number {
  return set.arc ?? 1;
}

/** Sets forgeables à l'arc donné. */
export function setsForArc(arc: number): ItemSet[] {
  return SETS.filter((s) => setArc(s) === arc);
}

/** La pièce appartient-elle à un set d'un AUTRE arc que `arc` (donc à masquer/refuser) ? */
export function setPieceWrongArc(pieceId: string, arc: number): boolean {
  const piece = SET_PIECES.find((p) => p.id === pieceId);
  const set = piece ? setById(piece.setId) : undefined;
  return Boolean(set) && setArc(set!) !== arc;
}

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
    // +10 % des PV max en dégâts bonus à chaque attaque (nerf du 20 juil. 2026 :
    // 20 % rendait le tank-DPS Colosse trop dominant).
    abilities4: [{ kind: 'hp_strike', value: 0.1 }],
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
    theme: 'Soigneur offensif — une part de tes soins blesse l’ennemi',
    bonus2: b({ atk: 25, hp: 100 }),
    weights: ['light', 'medium', 'heavy'],
    // NERF : le set rendait 50 % du soin et convertissait les 50 % restants en
    // dégâts — aucune perte, donc un gain sec de dégâts pour un soigneur. Il rend
    // désormais 70 % et ne convertit que 20 % : le soin reste amputé, mais bien
    // moins qu'avant, et les dégâts offerts sont divisés par 2,5. Les 10 % restants
    // sont volontairement perdus, c'est le coût du set.
    abilities4: [{ kind: 'heal_convert', ratio: 0.2, healRatio: 0.7 }],
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

/* ------------------------------------------------------- ZONE D'UNE PIÈCE -- */

/** Objet stocké, vu par la déduction de zone (sous-ensemble de `items`). */
export type ZoneProbe = {
  name: string;
  set_id?: string | null;
  tier?: number | null;
  craft_cost?: unknown;
  base_atk_bonus?: number | null;
  base_def_bonus?: number | null;
  base_hp_bonus?: number | null;
};

/**
 * Zone du matériau avec lequel une pièce de SET a été forgée.
 *
 * Le nom d'une pièce de set (« Grimoire du Tacticien (Atours du Tacticien) »)
 * ne porte aucun suffixe de zone : la zone était donc figée à 10 partout, si
 * bien qu'une pièce forgée en chêne (zone 1) affichait 10 étoiles et réclamait
 * de la poussière d'étoile pour être améliorée — hors de portée en début de
 * partie. On la retrouve désormais :
 *
 *   1. par `craft_cost` (exact, écrit à l'insertion depuis la migration 0097) ;
 *   2. à défaut, en inversant les stats : `craftSetPieceStats` est déterministe,
 *      donc le matériau qui REPRODUIT les stats stockées est le bon (même
 *      inversion que le recyclage, pour les pièces d'avant `craft_cost`).
 *
 * 0 si l'objet n'est pas une pièce de set ou reste indéductible.
 */
export function setPieceZone(item: ZoneProbe): number {
  if (!item.set_id) return 0;

  const fromCost = materialZoneOfCraftCost(item.craft_cost);
  if (fromCost > 0) return fromCost;

  const piece = SET_PIECES.find((p) => p.setId === item.set_id && item.name.startsWith(p.label));
  if (!piece) return 0;
  const tm = tierGearMult(item.tier ?? 1);
  const atk = item.base_atk_bonus ?? 0;
  const def = item.base_def_bonus ?? 0;
  const hp = item.base_hp_bonus ?? 0;

  // GARDE-FOU. Sans stats de base, l'inversion ci-dessous compare à 0/0/0 et
  // élit forcément le matériau le plus FAIBLE : elle répondrait « zone 1 » avec
  // aplomb pour toutes les pièces du serveur. C'est exactement ce qui est arrivé
  // — un appelant qui ne sélectionnait ni `craft_cost` ni les `base_*` recevait
  // une réponse fausse au lieu d'une absence de réponse.
  //
  // « Je ne sais pas » (0) est la seule sortie honnête ici, et l'appelant décide
  // quoi en faire. Une inversion n'est valable que si on lui donne à inverser.
  if (atk === 0 && def === 0 && hp === 0) return 0;

  let best: { zone: number; err: number } | null = null;
  for (const mat of FORGE_MATERIALS) {
    const s = craftSetPieceStats(piece, mat);
    const err =
      Math.abs(Math.round(s.atk * tm) - atk) +
      Math.abs(Math.round(s.def * tm) - def) +
      Math.abs(Math.round(s.hp * tm) - hp);
    if (!best || err < best.err) best = { zone: mat.zone, err };
  }
  return best?.zone ?? 0;
}

/* --------------------------------------------------------- BONUS & EFFETS -- */

function countSets(equippedSetIds: (string | null | undefined)[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of equippedSetIds) if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
  return counts;
}

/**
 * La classe peut-elle bénéficier de ce set ? Vrai si les poids autorisés de la
 * classe croisent ceux du set. `classId` omis → aucune restriction (repli).
 *
 * ATTENTION, piège connu : `equip_item` n'applique AUCUN contrôle de poids aux
 * pièces de set (`and v_item_set_id is null` côté SQL). N'importe quelle classe
 * peut donc porter un ensemble entier sans en tirer le moindre bonus. C'est
 * volontaire — on ne bloque pas l'équipement — mais ça n'est supportable que
 * parce que l'UI signale explicitement le set comme INACTIF (chip barré + motif
 * dans l'infobulle, cf. `activeSets().usable`). Si cet affichage disparaît, la
 * restriction redevient un piège silencieux.
 *
 * Les petits sets (bijou + relique) restent universels : leurs deux pièces sont
 * des slots SANS poids, les restreindre n'aurait aucun sens.
 */
export function classCanUseSet(set: ItemSet, classId?: string | null): boolean {
  if (!classId) return true;
  const allowed = CLASS_ALLOWED_WEIGHTS[classId] ?? ['light', 'medium', 'heavy'];
  return set.weights.some((w) => allowed.includes(w));
}

/**
 * Une classe peut-elle ÉQUIPER cette pièce de set ?
 *
 * Le test porte sur les poids DU SET, pas sur ceux de la pièce. Un grand set
 * compte un bijou et une relique sans poids : ne filtrer que sur la pièce aurait
 * laissé un mage équiper 2 pièces du Colosse et n'en tirer aucun bonus — le piège
 * silencieux qu'on cherche justement à fermer. `setId` nul → objet hors set,
 * la règle de poids ordinaire s'applique ailleurs.
 */
export function classCanEquipSetPiece(setId: string | null | undefined, classId?: string | null): boolean {
  if (!setId || !classId) return true;
  const set = setById(setId);
  return set ? classCanUseSet(set, classId) : true;
}

/** Classes autorisées pour un ensemble de poids — sert à l'afficher au joueur. */
export function classesForWeights(weights: readonly ItemWeight[]): string[] {
  return Object.keys(CLASS_ALLOWED_WEIGHTS).filter((cls) =>
    (CLASS_ALLOWED_WEIGHTS[cls] ?? []).some((w) => weights.includes(w)),
  );
}

/**
 * Bonus de STATS des sets à ≥2 pièces équipées. Si `classId` est fourni, les sets
 * dont le poids ne convient pas à la classe sont IGNORÉS (restriction de classe).
 */
export function computeSetBonuses(
  equippedSetIds: (string | null | undefined)[],
  classId?: string | null,
  /**
   * Tier (= arc) des PIÈCES équipées. Les `bonus2` sont écrits à l'échelle de
   * l'arc 1 ; comme les stats d'un objet forgé, ils suivent le multiplicateur
   * d'arc. Défaut 1 = comportement historique inchangé.
   *
   * ⚠️ Sans ce scaling, un bonus 2 pièces resterait à +250 PV en arc 2 alors que
   * l'équipement en donne des milliers : le set deviendrait décoratif au moment
   * précis où il devrait peser le plus. C'est le tier des PIÈCES qui compte, pas
   * l'arc du joueur — porter des pièces d'arc 1 en arc 2 ne doit rien multiplier.
   */
  tier = 1,
): SetStatBonus {
  const total: SetStatBonus = { atk: 0, def: 0, hp: 0 };
  const tm = tierGearMult(tier);
  for (const [sid, cnt] of countSets(equippedSetIds)) {
    const set = setById(sid);
    if (!set || cnt < 2 || !classCanUseSet(set, classId)) continue;
    total.atk += Math.round(set.bonus2.atk * tm);
    total.def += Math.round(set.bonus2.def * tm);
    total.hp += Math.round(set.bonus2.hp * tm);
  }
  return total;
}

/**
 * Tier (= arc) à retenir pour le bonus 2 pièces, déduit des objets équipés.
 *
 * On prend le tier le PLUS HAUT parmi les pièces qui appartiennent à un set :
 * un set se craft normalement d'un bloc dans un même arc, et en cas de mélange
 * c'est la pièce la plus récente qui donne le ton. Les objets hors set sont
 * ignorés — une arme divine d'arc 2 ne doit pas gonfler le bonus d'un set d'arc 1.
 */
export function equippedSetTier(
  items: ({ set_id?: string | null; tier?: number | null } | null | undefined)[],
): number {
  let tier = 1;
  for (const it of items) {
    if (!it?.set_id) continue;
    tier = Math.max(tier, it.tier ?? 1);
  }
  return tier;
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
      // `healRatio` peut être indépendant de `ratio` : afficher `1 − ratio`
      // mentirait sur ce que l'allié reçoit réellement.
      return `Soins émis : ${Math.round((a.healRatio ?? 1 - a.ratio) * 100)} % aux alliés, ${Math.round(a.ratio * 100)} % en dégâts sur un ennemi aléatoire.`;
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
