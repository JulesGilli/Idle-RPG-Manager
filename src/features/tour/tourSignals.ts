import { create } from 'zustand';

/**
 * Signaux d'UI éphémères que le tutoriel ne peut pas déduire des requêtes
 * (état local de la modale de déploiement). Le hook `useTour` les lit pour faire
 * avancer les étapes fines : « la modale est ouverte », « un héros est composé ».
 * Réinitialisés à la fermeture de la modale.
 */
type TourSignals = {
  deployModalOpen: boolean;
  deployHeroChosen: boolean;
  setDeployModalOpen: (v: boolean) => void;
  setDeployHeroChosen: (v: boolean) => void;
};

export const useTourSignals = create<TourSignals>((set) => ({
  deployModalOpen: false,
  deployHeroChosen: false,
  setDeployModalOpen: (v) => set({ deployModalOpen: v }),
  setDeployHeroChosen: (v) => set({ deployHeroChosen: v }),
}));
