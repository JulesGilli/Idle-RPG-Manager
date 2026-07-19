import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Téléporte une modale plein écran dans <body>, HORS de l'arbre DOM de l'écran.
 *
 * Indispensable : chaque écran est enveloppé dans `.anim-fade`, et une animation
 * CSS terminée reste « attachée » (Chrome/Safari conservent alors le contexte
 * d'empilement, quel que soit le fill-mode — vérifié empiriquement). Une modale
 * `fixed z-50` rendue dedans est donc piégée SOUS la nav basse mobile (z-40),
 * le chat et le panneau admin : sur téléphone, le bouton « Déployer » de la
 * carte était masqué par la barre de navigation.
 *
 * Rendue dans <body>, la modale échappe à tout contexte hérité ; couleurs et
 * police restent corrects (définis sur body/:root dans index.css).
 */
export function BodyPortal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}
