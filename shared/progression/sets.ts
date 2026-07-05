/**
 * SETS D'ENSEMBLE : équipements liés à un set. Porter plusieurs pièces du même
 * set octroie des bonus de stats (2 pièces, puis 4 pièces, cumulatifs).
 * Les pièces se forgent avec les matériaux UNIQUES d'expédition (leur débouché).
 *
 * Pur et partagé front + Edge Function : définitions statiques + calcul du bonus.
 */

export type SetStatBonus = { atk: number; def: number; hp: number };
export type SlotType = 'weapon' | 'armor' | 'jewel' | 'relic';

export type ItemSet = {
  id: string;
  name: string;
  theme: string;
  /** Bonus dès 2 pièces équipées. */
  bonus2: SetStatBonus;
  /** Bonus supplémentaire dès 4 pièces (s'ajoute au bonus 2 pièces). */
  bonus4: SetStatBonus;
};

const ZERO: SetStatBonus = { atk: 0, def: 0, hp: 0 };
const b = (o: Partial<SetStatBonus>): SetStatBonus => ({ ...ZERO, ...o });

export const SETS: ItemSet[] = [
  {
    id: 'sylve',
    name: 'Parure de la Sylve Primordiale',
    theme: 'Vitalité de la forêt fossile',
    bonus2: b({ hp: 150 }),
    bonus4: b({ hp: 400, def: 25 }),
  },
  {
    id: 'arcane',
    name: 'Regalia de l’Arcane Englouti',
    theme: 'Puissance des ruines noyées',
    bonus2: b({ atk: 22 }),
    bonus4: b({ atk: 55, hp: 200 }),
  },
  {
    id: 'stellaire',
    name: 'Harnois de la Forge Stellaire',
    theme: 'Alliage des mines abyssales',
    bonus2: b({ def: 25 }),
    bonus4: b({ def: 55, atk: 25 }),
  },
];

export function setById(id: string | null | undefined): ItemSet | undefined {
  return id ? SETS.find((s) => s.id === id) : undefined;
}

export type SetPieceRecipe = {
  id: string;
  setId: string;
  slot: SlotType;
  label: string;
  gold: number;
  materials: { key: string; qty: number }[];
  /** Stats propres de la pièce (en plus du bonus de set). */
  atk: number;
  def: number;
  hp: number;
};

/** 4 pièces par set (une par slot). Coût en matériaux uniques d'expédition. */
export const SET_PIECES: SetPieceRecipe[] = [
  // Sylve Primordiale (vitalité)
  { id: 'sylve_weapon', setId: 'sylve', slot: 'weapon', label: 'Bâton de Sève', gold: 2000, materials: [{ key: 'seve_primordiale', qty: 6 }, { key: 'ambre_vivant', qty: 3 }], atk: 30, def: 0, hp: 90 },
  { id: 'sylve_armor', setId: 'sylve', slot: 'armor', label: 'Carapace d’Écorce', gold: 2200, materials: [{ key: 'seve_primordiale', qty: 8 }, { key: 'coeur_sylve_ancien', qty: 1 }], atk: 0, def: 28, hp: 160 },
  { id: 'sylve_jewel', setId: 'sylve', slot: 'jewel', label: 'Amulette d’Ambre', gold: 1800, materials: [{ key: 'ambre_vivant', qty: 5 }], atk: 0, def: 10, hp: 130 },
  { id: 'sylve_relic', setId: 'sylve', slot: 'relic', label: 'Totem Sylvestre', gold: 2600, materials: [{ key: 'coeur_sylve_ancien', qty: 2 }, { key: 'seve_primordiale', qty: 4 }], atk: 0, def: 18, hp: 220 },
  // Arcane Englouti (attaque)
  { id: 'arcane_weapon', setId: 'arcane', slot: 'weapon', label: 'Sceptre Noyé', gold: 2400, materials: [{ key: 'poussiere_arcane', qty: 7 }, { key: 'tablette_oubliee', qty: 2 }], atk: 58, def: 0, hp: 0 },
  { id: 'arcane_armor', setId: 'arcane', slot: 'armor', label: 'Robe des Profondeurs', gold: 2200, materials: [{ key: 'poussiere_arcane', qty: 8 }, { key: 'relique_noyee', qty: 1 }], atk: 15, def: 14, hp: 100 },
  { id: 'arcane_jewel', setId: 'arcane', slot: 'jewel', label: 'Sceau Oublié', gold: 1900, materials: [{ key: 'tablette_oubliee', qty: 4 }], atk: 32, def: 0, hp: 0 },
  { id: 'arcane_relic', setId: 'arcane', slot: 'relic', label: 'Relique Engloutie', gold: 2800, materials: [{ key: 'relique_noyee', qty: 2 }, { key: 'poussiere_arcane', qty: 4 }], atk: 28, def: 0, hp: 130 },
  // Forge Stellaire (défense)
  { id: 'stellaire_weapon', setId: 'stellaire', slot: 'weapon', label: 'Lame Stellaire', gold: 2600, materials: [{ key: 'minerai_stellaire', qty: 7 }, { key: 'gemme_brute', qty: 3 }], atk: 46, def: 12, hp: 0 },
  { id: 'stellaire_armor', setId: 'stellaire', slot: 'armor', label: 'Plastron d’Alliage', gold: 2800, materials: [{ key: 'minerai_stellaire', qty: 9 }, { key: 'eclat_du_noyau', qty: 1 }], atk: 0, def: 40, hp: 140 },
  { id: 'stellaire_jewel', setId: 'stellaire', slot: 'jewel', label: 'Gemme Taillée', gold: 2000, materials: [{ key: 'gemme_brute', qty: 5 }], atk: 0, def: 28, hp: 60 },
  { id: 'stellaire_relic', setId: 'stellaire', slot: 'relic', label: 'Noyau Stellaire', gold: 3000, materials: [{ key: 'eclat_du_noyau', qty: 2 }, { key: 'minerai_stellaire', qty: 5 }], atk: 22, def: 34, hp: 100 },
];

export function setPieceById(id: string): SetPieceRecipe | undefined {
  return SET_PIECES.find((p) => p.id === id);
}

/* ------------------------------------------------------ RECETTE COMPOSÉE -- */
// Une pièce de set réunit les QUATRE sources du jeu (recette homogène) :
//   • matériaux de ZONE (carte) — base commune à tous les crafts,
//   • matériaux d'EXPÉDITION — la signature de la pièce (déjà dans `materials`),
//   • un composant de BOSS — détermine l'ENSEMBLE (un par set),
//   • un matériau de DONJON — la touche « relique » partagée.

type Mat = { key: string; qty: number };

/** Composant de boss signature de chaque ensemble (choix de l'ensemble). */
export const SET_BOSS_COMPONENT: Record<string, string> = {
  sylve: 'coeur_sylve',
  arcane: 'encre_kraken',
  stellaire: 'fragment_titan',
};

/** Matériau de zone (carte) requis par toute pièce de set. */
export const SET_ZONE_MATERIAL: Mat = { key: 'ecorce', qty: 8 };
/** Matériau de donjon requis par toute pièce de set. */
export const SET_DUNGEON_MATERIAL: Mat = { key: 'sceau_catacombe', qty: 1 };

/** Additionne les quantités par clé (évite les doublons dans une recette). */
function mergeMaterials(mats: Mat[]): Mat[] {
  const acc = new Map<string, number>();
  for (const m of mats) acc.set(m.key, (acc.get(m.key) ?? 0) + m.qty);
  return [...acc].map(([key, qty]) => ({ key, qty }));
}

/**
 * Recette complète d'une pièce de set : zone + expédition + boss (ensemble) +
 * donjon. Utilisée à l'identique côté client (affichage) et serveur (coût).
 */
export function setPieceRecipe(piece: SetPieceRecipe): { gold: number; materials: Mat[] } {
  const boss = SET_BOSS_COMPONENT[piece.setId];
  return {
    gold: piece.gold,
    materials: mergeMaterials([
      SET_ZONE_MATERIAL,
      ...piece.materials,
      ...(boss ? [{ key: boss, qty: 1 }] : []),
      SET_DUNGEON_MATERIAL,
    ]),
  };
}

/**
 * Bonus de set actifs à partir des set_id des objets équipés (weapon/armor/jewel/
 * relic). 2 pièces d'un même set → bonus2 ; 4 pièces → bonus2 + bonus4.
 */
export function computeSetBonuses(equippedSetIds: (string | null | undefined)[]): SetStatBonus {
  const counts = new Map<string, number>();
  for (const s of equippedSetIds) if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
  const total: SetStatBonus = { atk: 0, def: 0, hp: 0 };
  for (const [sid, cnt] of counts) {
    const set = setById(sid);
    if (!set) continue;
    if (cnt >= 2) {
      total.atk += set.bonus2.atk;
      total.def += set.bonus2.def;
      total.hp += set.bonus2.hp;
    }
    if (cnt >= 4) {
      total.atk += set.bonus4.atk;
      total.def += set.bonus4.def;
      total.hp += set.bonus4.hp;
    }
  }
  return total;
}

/** Détail des sets actifs (pour l'affichage UI). */
export type ActiveSet = { set: ItemSet; count: number };
export function activeSets(equippedSetIds: (string | null | undefined)[]): ActiveSet[] {
  const counts = new Map<string, number>();
  for (const s of equippedSetIds) if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
  const out: ActiveSet[] = [];
  for (const [sid, count] of counts) {
    const set = setById(sid);
    if (set && count >= 2) out.push({ set, count });
  }
  return out;
}
