import { useProfile } from '@/hooks/useProfile';
import {
  accountProgress,
  accountTitle,
  isActivityUnlocked,
  type ActivityKey,
} from '@shared/progression/account.ts';

/**
 * Méta-progression du compte, dérivée du profil (XP de compte).
 * Sert à débloquer progressivement les activités du jeu.
 */
export function useAccount() {
  const { data: profile, isLoading } = useProfile();
  const xp = profile?.account_xp ?? 0;
  const progress = accountProgress(xp);

  return {
    isLoading,
    xp,
    level: progress.level,
    title: accountTitle(progress.level),
    xpInLevel: progress.xpInLevel,
    xpForLevel: progress.xpForLevel,
    /** L'activité est-elle débloquée au niveau de compte actuel ? */
    unlocked: (activity: ActivityKey) => isActivityUnlocked(activity, progress.level),
  };
}
