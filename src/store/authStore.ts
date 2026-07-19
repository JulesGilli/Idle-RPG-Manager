import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';

type AuthState = {
  session: Session | null;
  user: User | null;
  /** Passe à true une fois la session initiale récupérée (évite un flash de login). */
  initialized: boolean;
  /**
   * Le joueur arrive d'un lien « mot de passe oublié ».
   *
   * Supabase lui OUVRE une session valide à ce moment-là : sans ce drapeau, il
   * atterrirait directement dans le jeu et ne verrait jamais l'écran de choix du
   * nouveau mot de passe — il resterait donc bloqué à la prochaine déconnexion.
   */
  recovering: boolean;
  init: () => void;
  /** Appelé une fois le nouveau mot de passe enregistré. */
  endRecovery: () => void;
  signOut: () => Promise<void>;
};

let subscribed = false;

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  initialized: false,
  recovering: false,

  init: () => {
    if (subscribed) return;
    subscribed = true;

    void supabase.auth.getSession().then(({ data }) => {
      set({
        session: data.session,
        user: data.session?.user ?? null,
        initialized: true,
      });
    });

    supabase.auth.onAuthStateChange((event, session) => {
      set({ session, user: session?.user ?? null, initialized: true });
      // `PASSWORD_RECOVERY` n'est émis QUE par un lien de récupération. On le
      // mémorise plutôt que de le traiter ici : l'événement passe une seule fois,
      // alors que l'écran doit rester affiché tant que le mot de passe n'est pas
      // changé (rechargement compris).
      if (event === 'PASSWORD_RECOVERY') set({ recovering: true });
    });
  },

  endRecovery: () => set({ recovering: false }),

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, recovering: false });
  },
}));
