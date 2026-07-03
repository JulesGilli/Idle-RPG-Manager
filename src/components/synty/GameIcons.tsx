/**
 * Icônes de jeu — 100% Synty, aucun emoji.
 * Petits wrappers autour de <SyntyGlyph> qui résolvent un concept d'UI
 * (action, type d'objet, classe, passif, relique) vers un sprite Synty teinté.
 */
import { SyntyGlyph } from './SyntyIcon';
import {
  UI_GLYPH,
  ITEM_TYPE_GLYPH,
  PASSIVE_GLYPH,
  RELIC_GLYPH,
  classWeaponCleanUrl,
  type UiIconName,
} from '@/lib/synty';
import { classMeta } from '@/lib/gameUi';

/** Icône d'interface générique (or, xp, combat, verrou, boss…). */
export function UiIcon({
  name,
  size = 16,
  color,
  className = '',
  title = '',
}: {
  name: UiIconName;
  size?: number;
  color?: string;
  className?: string;
  title?: string;
}) {
  const g = UI_GLYPH[name];
  return (
    <SyntyGlyph
      src={g.src}
      size={size}
      color={color ?? ('tint' in g ? (g.tint as string) : 'currentColor')}
      className={className}
      title={title}
    />
  );
}

/** Icône de classe de héros (silhouette d'arme teintée par l'accent de classe). */
export function ClassIcon({
  classId,
  size = 18,
  color,
  className = '',
}: {
  classId: string;
  size?: number;
  color?: string;
  className?: string;
}) {
  return (
    <SyntyGlyph
      src={classWeaponCleanUrl(classId)}
      size={size}
      color={color ?? classMeta(classId).accent}
      className={className}
      title={classMeta(classId).label}
    />
  );
}

/** Icône de type d'objet (arme / armure / bijou / relique). */
export function ItemTypeIcon({
  type,
  size = 18,
  color = 'currentColor',
  className = '',
}: {
  type: string;
  size?: number;
  color?: string;
  className?: string;
}) {
  const src = ITEM_TYPE_GLYPH[type] ?? ITEM_TYPE_GLYPH.weapon!;
  return <SyntyGlyph src={src} size={size} color={color} className={className} />;
}

/** Icône de passif de bijou. */
export function PassiveIcon({
  passive,
  size = 14,
  color,
  className = '',
}: {
  passive: string;
  size?: number;
  color?: string;
  className?: string;
}) {
  const g = PASSIVE_GLYPH[passive];
  if (!g) return null;
  return (
    <SyntyGlyph src={g.src} size={size} color={color ?? g.tint ?? 'currentColor'} className={className} />
  );
}

/** Icône de modèle de relique. */
export function RelicIcon({
  baseId,
  size = 18,
  color,
  className = '',
}: {
  baseId: string;
  size?: number;
  color?: string;
  className?: string;
}) {
  const g = RELIC_GLYPH[baseId] ?? { src: ITEM_TYPE_GLYPH.relic!, tint: '#c084fc' };
  return (
    <SyntyGlyph src={g.src} size={size} color={color ?? g.tint ?? 'currentColor'} className={className} />
  );
}
