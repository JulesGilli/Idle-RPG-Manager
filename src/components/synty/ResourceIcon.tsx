/**
 * Icône d'une ressource de jeu, à partir de sa clé.
 * - Ressource mappée sans teinte → prop Synty pleine couleur (`SyntyImg`).
 * - Ressource mappée avec teinte (gemmes de boss) → silhouette teintée (`SyntyGlyph`).
 * - Non mappée → repli Synty générique.
 *
 * PROVENANCE : l'icône porte l'infobulle « Nom — où farmer » (survol, desktop) et
 * ouvre au CLIC la fiche détaillée (`ResourceInfoProvider`), qui est le pendant
 * tactile pour le mobile. C'est le point unique qui rend la provenance visible
 * dans TOUS les écrans (forge, joaillerie, autel, oratoire, runes, inventaire…)
 * sans que chacun ait à s'en occuper.
 */
import { resourceTooltip } from '@/lib/resourceSources';
import { useResourceInfo } from '@/components/resourceInfoContext';
import { resourceIcon, syntyUrl } from '@/lib/synty';
import { SyntyGlyph, SyntyImg } from './SyntyIcon';

export function ResourceIcon({
  resKey,
  size = 14,
  className = '',
  noInfo = false,
}: {
  resKey: string;
  size?: number;
  className?: string;
  /** Désactive l'ouverture de la fiche (utile DANS la fiche elle-même). */
  noInfo?: boolean;
}) {
  const openInfo = useResourceInfo();
  const title = resourceTooltip(resKey);
  const glyph = resourceIcon(resKey);

  const icon = glyph?.tint ? (
    <SyntyGlyph src={glyph.src} color={glyph.tint} size={size} title={title} className={className} />
  ) : glyph ? (
    <SyntyImg src={glyph.src} size={size} title={title} className={className} />
  ) : (
    // Repli 100% Synty (jamais d'emoji) : silhouette générique d'objet.
    <SyntyGlyph
      src={syntyUrl.inv('Items01')}
      color="var(--color-muted)"
      size={size}
      title={title}
      className={className}
    />
  );

  if (noInfo) return icon;

  // `stopPropagation` : l'icône vit souvent dans une carte ou un bouton (coût de
  // craft, ligne de butin…) — consulter la provenance ne doit jamais déclencher
  // l'action du parent. `span` et non `button` : elle est parfois DANS un bouton,
  // et un bouton imbriqué serait du HTML invalide.
  return (
    <span
      role="button"
      tabIndex={-1}
      aria-label={title}
      className="inline-flex cursor-help align-middle"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        openInfo(resKey);
      }}
    >
      {icon}
    </span>
  );
}
