import { LeaderboardScreen } from './LeaderboardScreen';

/** Le classement global affiché en superposition (rubrique du header). */
export function LeaderboardModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="anim-fade fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-8">
      <div className="panel anim-pop relative w-full max-w-3xl p-5">
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
