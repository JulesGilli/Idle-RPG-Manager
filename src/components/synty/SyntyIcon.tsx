/**
 * Rendu des icônes Synty.
 * - `SyntyGlyph` : icône « Clean » (silhouette blanche) rendue via CSS mask →
 *   teintable en n'importe quelle couleur (stats, statuts de combat).
 * - `SyntyImg`   : icône pleine couleur (armes, gems, ornements…).
 * Purement présentational, aucune logique de jeu.
 */
import type { CSSProperties } from 'react';

export function SyntyGlyph({
  src,
  size = 20,
  color = 'currentColor',
  className = '',
  title,
}: {
  src: string;
  size?: number;
  color?: string;
  className?: string;
  title?: string;
}) {
  const style: CSSProperties = {
    width: size,
    height: size,
    backgroundColor: color,
    WebkitMaskImage: `url("${src}")`,
    maskImage: `url("${src}")`,
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
  };
  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      className={`inline-block shrink-0 align-middle ${className}`}
      style={style}
    />
  );
}

export function SyntyImg({
  src,
  size,
  className = '',
  title,
  alt = '',
}: {
  src: string;
  size?: number;
  className?: string;
  title?: string;
  alt?: string;
}) {
  return (
    <img
      src={src}
      alt={alt}
      title={title}
      draggable={false}
      className={`shrink-0 select-none object-contain ${className}`}
      style={size ? { width: size, height: size } : undefined}
    />
  );
}
