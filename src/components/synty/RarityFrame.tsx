/**
 * Cadre de rareté réutilisable : un cadre médiéval doré (border-image, centre
 * creux) + un halo/anneau teinté selon le palier (D-C-B-A-S ou poor→ultimate).
 * La couleur est passée en prop (hex) → un seul composant pour les 5 paliers.
 * Overlay `pointer-events-none` : n'affecte pas le layout du contenu.
 */
import type { CSSProperties, ReactNode } from 'react';
import { FRAME_MEDIUM } from '@/lib/synty';

export function RarityFrame({
  color,
  children,
  className = '',
  frameWidth = 14,
  slice = 128,
  glow = true,
  radius = '0.9rem',
}: {
  /** Couleur du palier (hex). */
  color: string;
  children: ReactNode;
  className?: string;
  /** Épaisseur rendue du cadre (px). */
  frameWidth?: number;
  /** Découpe border-image (px sur les 512 du PNG). */
  slice?: number;
  glow?: boolean;
  radius?: string;
}) {
  const wrapStyle: CSSProperties = {
    borderRadius: radius,
    boxShadow: glow ? `0 0 0 1px ${color}66, 0 0 22px -6px ${color}` : undefined,
  };
  const frameStyle: CSSProperties = {
    borderStyle: 'solid',
    borderWidth: frameWidth,
    borderImageSource: `url("${FRAME_MEDIUM}")`,
    borderImageSlice: slice,
    borderImageRepeat: 'stretch',
  };
  return (
    <div className={`relative ${className}`} style={wrapStyle}>
      {children}
      <span aria-hidden className="pointer-events-none absolute inset-0" style={frameStyle} />
    </div>
  );
}
