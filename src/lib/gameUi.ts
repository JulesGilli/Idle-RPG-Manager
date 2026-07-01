export type ClassMeta = {
  icon: string;
  label: string;
  /** Couleur d'accent (hex) utilisée pour barres/auras. */
  accent: string;
  badge: string;
};

export const CLASS_META: Record<string, ClassMeta> = {
  tank: { icon: '🛡️', label: 'Tank', accent: '#56b6f4', badge: 'bg-sky-500/15 text-sky-200' },
  dps: { icon: '⚔️', label: 'DPS', accent: '#f06b6b', badge: 'bg-rose-500/15 text-rose-200' },
  healer: {
    icon: '✚',
    label: 'Soigneur',
    accent: '#5fd39b',
    badge: 'bg-emerald-500/15 text-emerald-200',
  },
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
  common: {
    label: 'Commun',
    text: 'text-neutral-200',
    ring: 'ring-neutral-600/50',
    glow: 'transparent',
  },
  rare: {
    label: 'Rare',
    text: 'text-sky-300',
    ring: 'ring-sky-500/50',
    glow: 'rgba(86,182,244,0.35)',
  },
  epic: {
    label: 'Épique',
    text: 'text-fuchsia-300',
    ring: 'ring-fuchsia-500/50',
    glow: 'rgba(213,114,245,0.4)',
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
