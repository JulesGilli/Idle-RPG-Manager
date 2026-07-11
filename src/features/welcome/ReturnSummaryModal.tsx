import { useNavigate } from 'react-router-dom';
import { SyntyGlyph } from '@/components/synty/SyntyIcon';
import { UiIcon } from '@/components/synty/GameIcons';
import { syntyUrl } from '@/lib/synty';
import type { ReturnSummary } from '@/hooks/useReturnSummary';

type Line = { icon: string; label: string; to: string };

/**
 * Écran « content de te revoir » : au retour, on résume ce qui t'attend et on
 * offre un raccourci vers chaque activité. Ne distribue rien — pointe le butin
 * en attente (le vrai plaisir idle du retour).
 */
export function ReturnSummaryModal({
  summary,
  onClose,
}: {
  summary: ReturnSummary;
  onClose: () => void;
}) {
  const navigate = useNavigate();

  const lines: Line[] = [];
  if (summary.mapFights > 0)
    lines.push({
      icon: syntyUrl.map('Flag01'),
      label: `${summary.mapFights} combat${summary.mapFights > 1 ? 's' : ''} de carte accumulé${summary.mapFights > 1 ? 's' : ''} à récolter`,
      to: '/map',
    });
  if (summary.expeditionsDone > 0)
    lines.push({
      icon: syntyUrl.map('Horse01'),
      label: `${summary.expeditionsDone} expédition${summary.expeditionsDone > 1 ? 's' : ''} terminée${summary.expeditionsDone > 1 ? 's' : ''} — butin à réclamer`,
      to: '/expeditions',
    });
  if (summary.dungeonsReady > 0)
    lines.push({
      icon: syntyUrl.map('Skull01'),
      label: `${summary.dungeonsReady} donjon${summary.dungeonsReady > 1 ? 's' : ''} de nouveau disponible${summary.dungeonsReady > 1 ? 's' : ''}`,
      to: '/dungeon',
    });
  if (summary.dailyClaim)
    lines.push({
      icon: syntyUrl.map('Key01'),
      label: 'Récompense journalière disponible',
      to: '/',
    });

  function go(to: string) {
    onClose();
    if (to !== '/') navigate(to);
  }

  return (
    <div
      className="anim-fade fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="panel anim-pop relative w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center gap-2.5">
          <SyntyGlyph src={syntyUrl.map('Dragon01')} size={28} color="var(--color-gold-soft)" />
          <h2 className="heading text-xl">Content de te revoir</h2>
        </div>
        <p className="mb-4 text-sm text-[var(--color-muted)]">
          Pendant ton absence, ton escouade a continué. Voilà ce qui t'attend :
        </p>

        <ul className="space-y-2">
          {lines.map((l) => (
            <li key={l.to + l.label}>
              <button
                onClick={() => go(l.to)}
                className="panel panel-hover flex w-full items-center gap-3 p-3 text-left"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.04]">
                  <SyntyGlyph src={l.icon} size={24} color="var(--color-gold-soft)" />
                </span>
                <span className="min-w-0 flex-1 text-sm font-medium text-[var(--color-ink)]">
                  {l.label}
                </span>
                <span className="shrink-0 text-[var(--color-muted)]">→</span>
              </button>
            </li>
          ))}
        </ul>

        <button onClick={onClose} className="btn btn-ghost mt-5 w-full text-sm">
          <UiIcon name="next" size={14} /> Plus tard
        </button>
      </div>
    </div>
  );
}
