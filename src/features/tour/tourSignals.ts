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
  /** Fenêtre de combat (replay d'assaut de carte) ouverte. */
  fightOpen: boolean;
  /** Le combat en cours a fini de se dérouler (bouton « valider » dispo). */
  fightDone: boolean;
  setDeployModalOpen: (v: boolean) => void;
  setDeployHeroChosen: (v: boolean) => void;
  setFightOpen: (v: boolean) => void;
  setFightDone: (v: boolean) => void;
};

export const useTourSignals = create<TourSignals>((set) => ({
  deployModalOpen: false,
  deployHeroChosen: false,
  fightOpen: false,
  fightDone: false,
  setDeployModalOpen: (v) => set({ deployModalOpen: v }),
  setDeployHeroChosen: (v) => set({ deployHeroChosen: v }),
  setFightOpen: (v) => set({ fightOpen: v }),
  setFightDone: (v) => set({ fightDone: v }),
}));
