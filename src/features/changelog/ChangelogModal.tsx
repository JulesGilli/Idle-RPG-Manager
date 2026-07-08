import { UiIcon } from '@/components/synty/GameIcons';
import { RELEASES, type ChangeTag, type Release } from './changelog';

const TAG_STYLE: Record<ChangeTag, { color: string; glyph: string }> = {
  Nouveau: { color: '#5fd39b', glyph: '✦' },
  Équilibrage: { color: '#8b7cf6', glyph: '⚖' },
  Correctif: { color: '#fb7185', glyph: '🛠' },
};

function TagPill({ tag }: { tag: ChangeTag }) {
  const s = TAG_STYLE[tag];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide"
      style={{ color: s.color, backgroundColor: `${s.color}1f` }}
    >
      <span aria-hidden>{s.glyph}</span>
      {tag}
    </span>
  );
}

function ReleaseBlock({ release, featured }: { release: Release; featured: boolean }) {
  const highlights = release.entries.filter((e) => e.highlight);
  const rest = release.entries.filter((e) => !e.highlight);

  return (
    <section className={featured ? '' : 'opacity-95'}>
      {/* En-tête de version */}
      <div className="mb-3 flex items-baseline gap-2">
        <span
          className="rounded-md px-2 py-0.5 text-[11px] font-bold"
          style={{
            color: featured ? 'var(--color-bg)' : 'var(--color-gold)',
            background: featured ? 'var(--color-gold)' : 'transparent',
            border: featured ? 'none' : '1px solid color-mix(in srgb, var(--color-gold) 40%, transparent)',
          }}
        >
          {release.version}
        </span>
        <h4 className="font-display text-[15px] font-bold leading-tight text-[var(--color-ink)]">
          {release.title}
        </h4>
        <span className="ml-auto shrink-0 text-[10px] text-[var(--color-muted)]">{release.date}</span>
      </div>

      {featured && release.summary && (
        <p className="mb-3 text-[12px] leading-snug text-[var(--color-muted)]">{release.summary}</p>
      )}

      {/* Changements phares — encadrés */}
      {featured && highlights.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {highlights.map((c, i) => (
            <li
              key={i}
              className="flex items-start gap-2 rounded-lg border border-[var(--color-edge)] bg-[var(--color-panel-2)] p-2.5 text-[13px]"
              style={{ borderLeft: `2px solid ${TAG_STYLE[c.tag].color}` }}
            >
              <TagPill tag={c.tag} />
              <span className="leading-snug text-[var(--color-ink)]">{c.text}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Reste des changements */}
      <ul className="space-y-1.5">
        {(featured ? rest : release.entries).map((c, i) => (
          <li key={i} className="flex items-start gap-2 text-[13px]">
            <TagPill tag={c.tag} />
            <span className="leading-snug text-[var(--color-ink)]/85">{c.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Panneau « Nouveautés » — journal des mises à jour groupé par version. */
export function ChangelogModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="panel anim-pop flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête fixe */}
        <div className="flex items-center justify-between border-b border-[var(--color-edge)] px-5 py-4">
          <h3 className="font-display flex items-center gap-2 text-lg font-semibold text-[var(--color-ink)]">
            <UiIcon name="changelog" size={18} /> Nouveautés
          </h3>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)]"
          >
            ✕
          </button>
        </div>

        {/* Corps défilant */}
        <div className="flex flex-col gap-6 overflow-y-auto px-5 py-4">
          {RELEASES.map((release, i) => (
            <ReleaseBlock key={release.version} release={release} featured={i === 0} />
          ))}
        </div>
      </div>
    </div>
  );
}
