/**
 * Icône d'une ressource de jeu, à partir de sa clé.
 * - Ressource mappée sans teinte → prop Synty pleine couleur (`SyntyImg`).
 * - Ressource mappée avec teinte (gemmes de boss) → silhouette teintée (`SyntyGlyph`).
 * - Non mappée → repli emoji (`resourceMeta`).
 * Purement présentational : aucune logique de jeu, ne touche pas aux clés de ressource.
 */
import { resourceMeta } from '@/hooks/useResources';
import { resourceIcon } from '@/lib/synty';
import { SyntyGlyph, SyntyImg } from './SyntyIcon';

export function ResourceIcon({
  resKey,
  size = 14,
  className = '',
}: {
  resKey: string;
  size?: number;
  className?: string;
}) {
  const meta = resourceMeta(resKey);
  const glyph = resourceIcon(resKey);
  if (glyph?.tint) {
    return <SyntyGlyph src={glyph.src} color={glyph.tint} size={size} title={meta.label} className={className} />;
  }
  if (glyph) {
    return <SyntyImg src={glyph.src} size={size} title={meta.label} className={className} />;
  }
  return (
    <span aria-hidden className={className}>
      {meta.icon}
    </span>
  );
}
