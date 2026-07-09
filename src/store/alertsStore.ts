import { create } from 'zustand';

/**
 * État « vu » des gommettes de notif, EN MÉMOIRE (non persisté) : une gommette
 * signale qu'un truc est devenu dispo *depuis la dernière fois que le joueur a
 * regardé*. Ouvrir la page concernée « acquitte » ce qui est dispo → la gommette
 * s'éteint. Elle ne revient que si un NOUVEAU jeton apparaît (nouveau cooldown
 * terminé, nouvelle expé finie…) ou au refresh (l'état mémoire repart de zéro).
 *
 * Modèle par jeton :
 * - donjons / expéditions : ensembles d'ids acquittés (un nouvel id → re-notifie).
 * - taverne : jour du pool acquitté (nouveau jour → re-notifie).
 * - bibliothèque : plus haut total de points de compétence vu (en gagner plus
 *   → re-notifie ; en dépenser ne re-notifie pas).
 */
type AlertsState = {
  seenDungeons: Set<string>;
  seenExpeditions: Set<string>;
  seenTavernDay: string | null;
  seenLibraryMax: number;
  ackDungeons: (ids: string[]) => void;
  ackExpeditions: (ids: string[]) => void;
  ackTavern: (day: string) => void;
  ackLibrary: (points: number) => void;
};

export const useAlertsStore = create<AlertsState>((set) => ({
  seenDungeons: new Set(),
  seenExpeditions: new Set(),
  seenTavernDay: null,
  seenLibraryMax: 0,

  ackDungeons: (ids) =>
    set((s) => {
      if (ids.every((id) => s.seenDungeons.has(id))) return s; // rien de neuf → pas de re-render
      const next = new Set(s.seenDungeons);
      ids.forEach((id) => next.add(id));
      return { seenDungeons: next };
    }),

  ackExpeditions: (ids) =>
    set((s) => {
      if (ids.every((id) => s.seenExpeditions.has(id))) return s;
      const next = new Set(s.seenExpeditions);
      ids.forEach((id) => next.add(id));
      return { seenExpeditions: next };
    }),

  ackTavern: (day) => set((s) => (s.seenTavernDay === day ? s : { seenTavernDay: day })),

  ackLibrary: (points) => set((s) => (points <= s.seenLibraryMax ? s : { seenLibraryMax: points })),
}));
