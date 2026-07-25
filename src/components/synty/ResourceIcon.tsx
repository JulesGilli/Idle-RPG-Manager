/**
 * Icône d'une ressource de jeu, à partir de sa clé.
 * - Ressource mappée sans teinte → prop Synty pleine couleur (`SyntyImg`).
 * - Ressource mappée avec teinte (gemmes de boss) → silhouette teintée (`SyntyGlyph`).
 * - Non mappée → repli emoji (`resourceMeta`).
 * Purement présentational : aucune logique de jeu, ne touche pas aux clés de ressource.
 *
 * L'infobulle (hover) dit le NOM et OÙ FARMER la ressource (`resourceSource`) —
 * c'est le point unique qui rend la provenance visible partout dans le jeu.
 * L'équivalent mobile (tap) vit dans l'onglet Matériaux de l'inventaire.
 */
import { resourceTooltip } from '@/lib/resourceSources';
import { resourceIcon, syntyUrl } from '@/lib/synty';
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
  const title = resourceTooltip(resKey);
  const glyph = resourceIcon(resKey);
  if (glyph?.tint) {
    return <SyntyGlyph src={glyph.src} color={glyph.tint} size={size} title={title} className={className} />;
  }
  if (glyph) {
    return <SyntyImg src={glyph.src} size={size} title={title} className={className} />;
  }
  // Repli 100% Synty (jamais d'emoji) : silhouette générique d'objet.
  return (
    <SyntyGlyph
      src={syntyUrl.inv('Items01')}
      color="var(--color-muted)"
      size={size}
      title={title}
      className={className}
    />
  );
}
