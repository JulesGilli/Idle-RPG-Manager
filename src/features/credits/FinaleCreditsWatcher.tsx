import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useProfile } from '@/hooks/useProfile';
import { useAuthStore } from '@/store/authStore';

/**
 * Déclencheur des crédits de fin. Surveille `profiles.finale_cleared_at` : dès
 * qu'il est renseigné (1re victoire sur le boss final) ET qu'on ne les a pas
 * déjà vus (marqueur localStorage par joueur), on déroule les crédits UNE fois.
 *
 * Rendu invisible, monté dans le layout : il n'affiche rien, il ne fait que la
 * bascule. On ne redéclenche jamais (le marqueur local persiste), mais l'écran
 * reste atteignable via `/credits` pour le revoir.
 */
export function FinaleCreditsWatcher() {
  const { data: profile } = useProfile();
  const userId = useAuthStore((s) => s.user?.id);
  const navigate = useNavigate();
  const location = useLocation();

  const cleared = (profile as { finale_cleared_at?: string | null } | undefined)?.finale_cleared_at ?? null;

  useEffect(() => {
    if (!cleared || !userId) return;
    const key = `credits_seen_${userId}`;
    if (localStorage.getItem(key)) return;
    // Évite de couper une session déjà sur l'écran de crédits.
    if (location.pathname === '/credits') return;
    localStorage.setItem(key, cleared);
    navigate('/credits');
  }, [cleared, userId, navigate, location.pathname]);

  return null;
}
