import type { ReactNode } from 'react';
import { useAuthStore } from '@/store/authStore';
import { LoginScreen } from './LoginScreen';
import { ResetPasswordScreen } from './ResetPasswordScreen';

export function RequireAuth({ children }: { children: ReactNode }) {
  const initialized = useAuthStore((s) => s.initialized);
  const session = useAuthStore((s) => s.session);
  const recovering = useAuthStore((s) => s.recovering);

  // Prioritaire sur la session : un lien de récupération en OUVRE une, donc sans
  // ce court-circuit le joueur entrerait dans le jeu sans jamais choisir son
  // nouveau mot de passe.
  if (initialized && recovering) return <ResetPasswordScreen />;

  if (!initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center text-neutral-500">
        Chargement…
      </div>
    );
  }

  if (!session) return <LoginScreen />;

  return <>{children}</>;
}
