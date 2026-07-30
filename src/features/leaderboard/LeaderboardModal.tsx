import { LeaderboardScreen } from './LeaderboardScreen';

/** Le classement global affiché en superposition (rubrique du header). */
export function LeaderboardModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      // SAFE-AREA haute/basse : en plein écran mobile l'appli passe sous la barre
      // d'état (encoche) ; sans ce retrait, le ✕ du panneau (en haut) tombait
      // dessous et devenait intappable sur iPhone.
      className="anim-fade fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-8"
      onClick={onClose}
    >
      <div
        className="panel anim-pop relative w-full max-w-3xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 text-[var(--color-muted)] hover:text-[var(--color-ink)]"
          title="Fermer"
        >
          ✕
        </button>
        <LeaderboardScreen />
      </div>
    </div>
  );
}
