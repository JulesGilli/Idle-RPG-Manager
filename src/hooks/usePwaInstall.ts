import { useCallback, useEffect, useState } from 'react';

// Event non standard émis par Chrome/Edge (Android + desktop) quand l'app est
// éligible à l'installation. TypeScript ne le connaît pas nativement.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** L'app tourne-t-elle déjà en mode « installée » (écran d'accueil, plein écran) ? */
function detectStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari iOS n'expose pas display-mode : il a son propre flag non standard.
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** iPhone/iPad ? (iPadOS 13+ se déguise en Mac tactile, d'où le second test.) */
function detectIos(): boolean {
  const ua = navigator.userAgent;
  return (
    /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'ios' | 'unavailable';

/**
 * Gère l'installation PWA de façon unifiée :
 * - Android/Chrome/Edge : capte `beforeinstallprompt` et déclenche la vraie
 *   popup système au clic.
 * - iOS/Safari : aucune API d'install → on signale `isIos` pour afficher un
 *   tuto « Partager → Sur l'écran d'accueil ».
 * - Déjà installée : `canInstall` repasse à false (rien à proposer).
 */
export function usePwaInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(detectStandalone);

  useEffect(() => {
    const onBeforeInstallPrompt = (e: Event) => {
      // On empêche la mini-barre auto de Chrome pour piloter l'install nous-mêmes.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setStandalone(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const isIos = detectIos();
  // Sur iOS il n'y a pas d'event : on propose quand même tant que non installée.
  const canInstall = !standalone && (deferred !== null || isIos);

  const promptInstall = useCallback(async (): Promise<InstallOutcome> => {
    if (deferred) {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === 'accepted') setStandalone(true);
      setDeferred(null);
      return outcome;
    }
    if (isIos) return 'ios';
    return 'unavailable';
  }, [deferred, isIos]);

  return {
    /** Y a-t-il quelque chose à proposer (non installée + moyen d'installer) ? */
    canInstall,
    /** iOS/Safari : nécessite le tuto manuel plutôt qu'un prompt natif. */
    isIos,
    /** Déjà installée / lancée depuis l'écran d'accueil. */
    standalone,
    /** Android/Chrome/Edge : un vrai prompt système est disponible. */
    hasNativePrompt: deferred !== null,
    promptInstall,
  };
}
