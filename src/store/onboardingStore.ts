import { create } from 'zustand';

/**
 * Jalon d'onboarding : « première défaite » (débloque village + taverne). On le
 * pilote depuis l'UI (fin ou abandon d'un combat) et non depuis l'état serveur,
 * pour que la défaite ne compte qu'une fois l'animation du combat terminée — et
 * qu'un abandon avant la fin compte comme une défaite, même si le combat était
 * calculé gagnant. Persisté localement, réinitialisé sur un compte neuf.
 */
const DEFEAT_KEY = 'onboarding-first-defeat-v1';

function readDefeat(): boolean {
  try {
    return localStorage.getItem(DEFEAT_KEY) === '1';
  } catch {
    return false;
  }
}

type OnboardingState = {
  hasLost: boolean;
  /** À appeler à la FIN d'un combat perdu, ou à l'abandon d'un combat en cours. */
  recordDefeat: () => void;
  /** Oublie la défaite (compte neuf / reset). */
  clearDefeat: () => void;
};

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  hasLost: readDefeat(),
  recordDefeat: () => {
    if (get().hasLost) return;
    try {
      localStorage.setItem(DEFEAT_KEY, '1');
    } catch {
      /* ignore */
    }
    set({ hasLost: true });
  },
  clearDefeat: () => {
    if (!get().hasLost) return;
    try {
      localStorage.removeItem(DEFEAT_KEY);
    } catch {
      /* ignore */
    }
    set({ hasLost: false });
  },
}));
