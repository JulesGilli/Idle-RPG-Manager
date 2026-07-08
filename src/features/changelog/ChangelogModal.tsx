import { UiIcon } from '@/components/synty/GameIcons';
import { CHANGELOG, CHANGELOG_UPDATED, type ChangeTag } from './changelog';

const TAG_COLOR: Record<ChangeTag, string> = {
  Nouveau: '#5fd39b',
  Équilibrage: '#8b7cf6',
  Correctif: '#fb7185',
};

/** Panneau « Nouveautés » — liste légère des dernières mises à jour. */
export function ChangelogModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="panel anim-pop max-h-[85vh] w-full max-w-md overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h3 className="font-display flex items-center gap-2 text-lg font-semibold text-[var(--color-ink)]">
            <UiIcon name="changelog" size={18} /> Nouveautés
          </h3>
          <button onClick={onClose} className="text-[var(--color-muted)] hover:text-[var(--color-ink)]">
            ✕
          </button>
        </div>
        <p className="mb-4 text-[11px] text-[var(--color-muted)]">À jour au {CHANGELOG_UPDATED}</p>

        <ul className="space-y-2">
          {CHANGELOG.map((c, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span
                className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                style={{ color: TAG_COLOR[c.tag], backgroundColor: `${TAG_COLOR[c.tag]}22` }}
              >
                {c.tag}
              </span>
              <span className="text-[var(--color-ink)]/90">{c.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
