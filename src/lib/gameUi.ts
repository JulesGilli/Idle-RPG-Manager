export type ClassMeta = {
  icon: string;
  label: string;
  /** Couleur d'accent (hex) utilisée pour barres/auras. */
  accent: string;
  badge: string;
};

export const CLASS_META: Record<string, ClassMeta> = {
  guerrier: { icon: '⚔️', label: 'Guerrier', accent: '#f0934a', badge: 'bg-orange-500/15 text-orange-200' },
  archer: { icon: '🏹', label: 'Archer', accent: '#5fd39b', badge: 'bg-emerald-500/15 text-emerald-200' },
  mage: { icon: '🔮', label: 'Mage', accent: '#8b7cf6', badge: 'bg-violet-500/15 text-violet-200' },
  paladin: { icon: '🛡️', label: 'Paladin', accent: '#e8b64a', badge: 'bg-amber-500/15 text-amber-200' },
  soigneur: { icon: '✚', label: 'Soigneur', accent: '#56b6f4', badge: 'bg-sky-500/15 text-sky-200' },
};

export const DEFAULT_CLASS_META: ClassMeta = {
  icon: '❔',
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

/** ★ pleins jusqu'à `value`, vides jusqu'à `max`. */
export function stars(value: number, max = 4): { full: number; empty: number } {
  const full = Math.max(0, Math.min(max, value));
  return { full, empty: Math.max(0, max - full) };
}
