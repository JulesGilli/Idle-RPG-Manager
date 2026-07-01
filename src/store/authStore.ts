import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';

type AuthState = {
  session: Session | null;
  user: User | null;
  /** Passe à true une fois la session initiale récupérée (évite un flash de login). */
  initialized: boolean;
  init: () => void;
  signOut: () => Promise<void>;
};

let subscribed = false;

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  initialized: false,

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

    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, user: session?.user ?? null, initialized: true });
    });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null });
  },
}));
