/**
 * Tuto d'installation iOS/Safari : Apple n'expose aucune API pour déclencher
 * l'ajout à l'écran d'accueil, on guide donc l'utilisateur manuellement.
 */
export function InstallModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="panel anim-pop max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h3 className="font-display flex items-center gap-2 text-lg font-semibold text-[var(--color-ink)]">
            📱 Installer sur ton iPhone
          </h3>
          <button onClick={onClose} className="text-[var(--color-muted)] hover:text-[var(--color-ink)]">
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-[var(--color-muted)]">
          En 2 gestes, ajoute <strong>Idle-RPG</strong> à ton écran d'accueil : elle se lancera en
          plein écran, comme une vraie appli.
        </p>

        <ol className="space-y-3">
          <li className="flex items-center gap-3 rounded-lg border border-[var(--color-edge)] bg-black/20 p-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-arcane)]/20 text-sm font-bold text-[var(--color-arcane)]">
              1
            </span>
            <span className="flex flex-1 items-center gap-2 text-sm text-[var(--color-ink)]">
              Appuie sur le bouton
              <ShareIcon />
              <strong>Partager</strong> en bas de Safari.
            </span>
          </li>
          <li className="flex items-center gap-3 rounded-lg border border-[var(--color-edge)] bg-black/20 p-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-arcane)]/20 text-sm font-bold text-[var(--color-arcane)]">
              2
            </span>
            <span className="flex-1 text-sm text-[var(--color-ink)]">
              Choisis <strong>« Sur l'écran d'accueil »</strong>, puis <strong>Ajouter</strong>.
            </span>
          </li>
        </ol>

        <p className="mt-4 text-center text-[11px] text-[var(--color-muted)]">
          Astuce : si le bouton Partager est masqué, fais défiler la page vers le haut pour faire
          réapparaître la barre de Safari.
        </p>
      </div>
    </div>
  );
}

/** Icône « Partager » iOS : rectangle avec flèche vers le haut. */
function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="none"
      stroke="#4c9ffe"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline shrink-0"
      aria-label="Partager"
    >
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M6 12H5a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}
