import type { ReactNode } from 'react';
import { useAuthStore } from '@/store/authStore';
import { LoginScreen } from './LoginScreen';

export function RequireAuth({ children }: { children: ReactNode }) {
  const initialized = useAuthStore((s) => s.initialized);
  const session = useAuthStore((s) => s.session);

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
