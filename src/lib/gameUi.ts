export type ClassMeta = {
  label: string;
  /** Couleur d'accent (hex) utilisée pour barres/auras. */
  accent: string;
  badge: string;
};

// L'icône de classe est une silhouette Synty (voir <ClassIcon> / classWeaponCleanUrl).
export const CLASS_META: Record<string, ClassMeta> = {
  guerrier: { label: 'Guerrier', accent: '#f0934a', badge: 'bg-orange-500/15 text-orange-200' },
  archer: { label: 'Archer', accent: '#5fd39b', badge: 'bg-emerald-500/15 text-emerald-200' },
  mage: { label: 'Mage', accent: '#8b7cf6', badge: 'bg-violet-500/15 text-violet-200' },
  paladin: { label: 'Paladin', accent: '#e8b64a', badge: 'bg-amber-500/15 text-amber-200' },
  // soigneur : id inchangé en base, libellé V2 = « Oracle » (cf. docs/refonte-v2.md §11).
  soigneur: { label: 'Oracle', accent: '#56b6f4', badge: 'bg-sky-500/15 text-sky-200' },
  // V2 — nouvelles classes
  voleur: { label: 'Voleur', accent: '#4fc4c4', badge: 'bg-cyan-500/15 text-cyan-200' },
  necromancien: { label: 'Nécromancien', accent: '#b467d6', badge: 'bg-fuchsia-500/15 text-fuchsia-200' },
  inquisiteur: { label: 'Inquisiteur', accent: '#e0563f', badge: 'bg-red-500/15 text-red-200' },
};

export const DEFAULT_CLASS_META: ClassMeta = {
  label: 'Héros',
  accent: '#9a93a8',
  badge: 'bg-white/10 text-neutral-300',
};

export function classMeta(classId: string): ClassMeta {
  return CLASS_META[classId] ?? DEFAULT_CLASS_META;
}

export type RarityMeta = { label: string; text: string; ring: string; glow: string };

export const RARITY_META: Record<string, RarityMeta> = {
  poor: {
    label: 'Médiocre',
    text: 'text-neutral-400',
    ring: 'ring-neutral-700/50',
    glow: 'transparent',
  },
  common: {
    label: 'Commun',
    text: 'text-neutral-100',
    ring: 'ring-neutral-500/40',
    glow: 'transparent',
  },
  uncommon: {
    label: 'Peu commun',
    text: 'text-emerald-300',
    ring: 'ring-emerald-500/50',
    glow: 'rgba(52,211,153,0.3)',
  },
  advanced: {
    label: 'Avancé',
    text: 'text-sky-300',
    ring: 'ring-sky-500/50',
    glow: 'rgba(86,182,244,0.35)',
  },
  ultimate: {
    label: 'Ultime',
    text: 'text-amber-300',
    ring: 'ring-amber-400/60',
    glow: 'rgba(245,181,68,0.45)',
  },
};

export function rarityMeta(rarity: string): RarityMeta {
  return RARITY_META[rarity] ?? RARITY_META.common!;
}

/**
 * Couleur de la rareté sur un dégradé unique gris → rouge-doré : plus l'objet est
 * pauvre, plus c'est gris ; plus il est rare, plus c'est doré/rouge. Sert à colorer
 * le MOT de rareté (pas le cadre entier).
 */
export const RARITY_COLOR: Record<string, string> = {
  poor: '#8b93a1', // gris
  common: '#ada78c', // gris chaud
  uncommon: '#cbab63', // beige doré
  advanced: '#e0a642', // doré
  ultimate: '#e07a38', // rouge-doré
};

export function rarityColor(rarity: string): string {
  return RARITY_COLOR[rarity] ?? RARITY_COLOR.common!;
}

/** ★ pleins jusqu'à `value`, vides jusqu'à `max`. */
export function stars(value: number, max = 4): { full: number; empty: number } {
  const full = Math.max(0, Math.min(max, value));
  return { full, empty: Math.max(0, max - full) };
}

/**
 * Grand nombre en compact : 1240 → « 1,2k », 15000 → « 15k », 10070363 → « 10,1M ».
 *
 * Les chiffres de ce jeu n'ont pas de plafond (or, PV de boss, puissance) : les
 * afficher bruts, c'est laisser l'interface casser dès que le joueur devient
 * riche — le header mobile débordait à 8 chiffres d'or. Un compact ne déborde
 * jamais : 4 caractères + suffixe, quelle que soit la fortune.
 *
 * Virgule décimale : le jeu est en français. Deux formateurs coexistaient et se
 * contredisaient (« 12.3M » côté arc, « 1,2k » côté cartes) ; celui-ci les
 * remplace tous les deux.
 *
 * Une décimale sous 100, arrondi au-dessus : « 12,3M » reste informatif, « 150k »
 * n'a pas besoin de sa virgule.
 */
export function compactNumber(n: number): string {
  const abs = Math.abs(n);
  const unit = (v: number, suffix: string): string => {
    const s = Math.abs(v) >= 100 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, '');
    return s.replace('.', ',') + suffix;
  };
  if (abs >= 1_000_000_000) return unit(n / 1_000_000_000, 'Md');
  if (abs >= 1_000_000) return unit(n / 1_000_000, 'M');
  if (abs >= 1_000) return unit(n / 1_000, 'k');
  return String(Math.round(n));
}

/** Nombre complet, séparateurs français — pour les infobulles : le compact arrondit. */
export function fullNumber(n: number): string {
  return Math.round(n).toLocaleString('fr-FR');
}
