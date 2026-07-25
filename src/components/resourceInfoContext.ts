import { createContext, useContext } from 'react';

/**
 * Contexte de la fiche « où farmer » (cf. `ResourceInfo.tsx`). Isolé du composant
 * pour que le fichier du provider n'exporte que des composants (fast refresh).
 */
export const ResourceInfoCtx = createContext<(resKey: string) => void>(() => {});

/** Ouvre la fiche « où farmer » d'une ressource (no-op hors du provider). */
export function useResourceInfo(): (resKey: string) => void {
  return useContext(ResourceInfoCtx);
}
