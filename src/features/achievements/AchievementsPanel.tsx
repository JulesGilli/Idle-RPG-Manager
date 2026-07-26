import { useTitlesStatus, useEquipTitle, type EventTitleRow } from './useAchievements';
import { ACHIEVEMENTS, type AchievementCategory } from '@shared/progression/achievements';
import { titleStatLabel } from '@shared/progression/eventTitles';
import { STAT_TITLE_COLOR } from '@/lib/gameUi';
import { UiIcon } from '@/components/synty/GameIcons';

/** Jours restants avant expiration d'un titre d'événement. */
function daysLeft(expiresAt: string): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / 86_400_000));
}

const CATEGORY_LABEL: Record<AchievementCategory, string> = {
  special: 'Spécial',
  progression: 'Progression',
  collection: 'Collection',
  pvp: 'Arène',
  maitrise: 'Maîtrise',
};

// « Spécial » en tête : ce sont les titres honorifiques, non rattrapables.
const CATEGORY_ORDER: AchievementCategory[] = ['special', 'progression', 'collection', 'pvp', 'maitrise'];

/**
 * Contenu « Succès & Titres » réutilisable (sans en-tête de page) : progression,
 * titre équipé, et la grille des succès par catégorie avec équipement du titre.
 * Utilisé par l'écran Succès dédié ET par la page Profil.
 */
export function AchievementsPanel() {
  const { data: status, isLoading } = useTitlesStatus();
  const equip = useEquipTitle();

  const unlocked = new Set(status?.unlocked ?? []);
  const currentTitle = status?.title ?? null;
  const doneCount = unlocked.size;
  const eventTitles = status?.event_titles ?? [];
  // Le titre équipé est-il un titre à stats ? (pilote sa couleur dans le bandeau)
  const equippedEvent = eventTitles.find((e) => e.title === currentTitle) ?? null;
  const equippedStat = equippedEvent ? titleStatLabel(equippedEvent.stat_mult) : null;

  return (
    <div className="space-y-4">
      <div className="panel p-5">
        <h2 className="heading flex items-center gap-2 text-xl">
          <UiIcon name="book" size={22} color="var(--color-gold-soft)" />
          Succès &amp; Titres
        </h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Débloque des succès en jouant et équipe le titre de ton choix parmi ceux obtenus.
          {!isLoading && (
            <>
              {' '}
              <span className="font-semibold text-[var(--color-ink)]">
                {doneCount}/{ACHIEVEMENTS.length}
              </span>{' '}
              débloqués.
            </>
          )}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-[var(--color-muted)]">Titre équipé :</span>
          {currentTitle ? (
            <span
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 font-semibold"
              style={
                equippedStat
                  ? { background: `${STAT_TITLE_COLOR}26`, color: STAT_TITLE_COLOR }
                  : { background: 'color-mix(in srgb, var(--color-gold-soft) 15%, transparent)', color: 'var(--color-gold-soft)' }
              }
            >
              « {currentTitle} »
              {equippedStat && (
                <span className="rounded-full bg-black/25 px-1.5 py-0.5 text-[10px] font-bold">
                  {equippedStat}
                </span>
              )}
              <button
                onClick={() => equip.mutate(null)}
                disabled={equip.isPending}
                className="text-[var(--color-muted)] transition hover:text-[var(--color-ember)]"
                title="Retirer le titre"
              >
                ✕
              </button>
            </span>
          ) : (
            <span className="text-[var(--color-muted)]">aucun</span>
          )}
        </div>
      </div>

      {/* Titres d'ÉVÉNEMENT : ils accordent des STATS et expirent — d'où leur
          couleur distincte et le rappel du bonus/temps restant. */}
      {eventTitles.length > 0 && (
        <EventTitlesPanel
          titles={eventTitles}
          currentTitle={currentTitle}
          onEquip={(t) => equip.mutate(t)}
          busy={equip.isPending}
        />
      )}

      {CATEGORY_ORDER.map((cat) => {
        const list = ACHIEVEMENTS.filter((a) => a.category === cat);
        return (
          <div key={cat} className="panel p-4">
            <h3 className="mb-3 font-display text-sm font-bold text-[var(--color-ink)]">{CATEGORY_LABEL[cat]}</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {list.map((a) => {
                const done = unlocked.has(a.id);
                const equipped = currentTitle === a.title;
                return (
                  <div
                    key={a.id}
                    className={`flex items-center justify-between gap-2 rounded-lg border p-3 ${
                      done
                        ? 'border-[var(--color-gold-soft)]/40 bg-[var(--color-gold-soft)]/[0.05]'
                        : 'border-[var(--color-edge)] opacity-70'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <UiIcon
                          name={done ? 'victory' : 'lock'}
                          size={13}
                          color={done ? 'var(--color-gold-soft)' : 'var(--color-muted)'}
                        />
                        <span className="font-semibold text-[var(--color-ink)]">{a.name}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--color-muted)]">{a.desc}</p>
                      <p className="mt-0.5 text-[10px] text-[var(--color-muted)]">
                        Titre : <span className="text-[var(--color-gold-soft)]">« {a.title} »</span>
                      </p>
                    </div>
                    {done && (
                      <button
                        onClick={() => equip.mutate(equipped ? null : a.title)}
                        disabled={equip.isPending}
                        className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                          equipped
                            ? 'bg-[var(--color-gold-soft)]/20 text-[var(--color-gold-soft)]'
                            : 'border border-[var(--color-edge)] text-[var(--color-ink)] hover:border-[var(--color-gold-soft)]/50'
                        }`}
                      >
                        {equipped ? 'Équipé' : 'Équiper'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Titres d'ÉVÉNEMENT : les seuls qui accordent des STATS réelles en combat.
 * Couleur dédiée (`STAT_TITLE_COLOR`), bonus affiché, et compte à rebours —
 * contrairement aux titres de succès, ils EXPIRENT.
 */
function EventTitlesPanel({
  titles,
  currentTitle,
  onEquip,
  busy,
}: {
  titles: EventTitleRow[];
  currentTitle: string | null;
  onEquip: (title: string | null) => void;
  busy: boolean;
}) {
  return (
    <div
      className="panel p-4"
      style={{ borderColor: `${STAT_TITLE_COLOR}55`, background: `${STAT_TITLE_COLOR}0d` }}
    >
      <h3 className="mb-1 flex items-center gap-1.5 font-display text-sm font-bold text-[var(--color-ink)]">
        <UiIcon name="power" size={15} color={STAT_TITLE_COLOR} /> Titres de gloire
      </h3>
      <p className="mb-3 text-xs text-[var(--color-muted)]">
        Gagnés en événement, ils accordent un <strong className="text-[var(--color-ink)]">bonus de
        stats réel</strong> tant qu'ils sont équipés — et ils expirent.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {titles.map((t) => {
          const equipped = currentTitle === t.title;
          const stat = titleStatLabel(t.stat_mult);
          const left = daysLeft(t.expires_at);
          return (
            <div
              key={t.title}
              className="flex items-center justify-between gap-2 rounded-lg border p-3"
              style={{ borderColor: `${STAT_TITLE_COLOR}66`, background: `${STAT_TITLE_COLOR}12` }}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold" style={{ color: STAT_TITLE_COLOR }}>
                    « {t.title} »
                  </span>
                  {stat && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                      style={{ background: `${STAT_TITLE_COLOR}2e`, color: STAT_TITLE_COLOR }}
                    >
                      {stat}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[10px] text-[var(--color-muted)]">
                  {t.source === 'world_boss' ? 'Boss de la Semaine — 1er du classement' : 'Événement'}
                  {' · '}
                  {left > 0 ? `expire dans ${left} j` : 'expire aujourd’hui'}
                </p>
              </div>
              <button
                onClick={() => onEquip(equipped ? null : t.title)}
                disabled={busy}
                className="shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold transition"
                style={
                  equipped
                    ? { background: `${STAT_TITLE_COLOR}33`, color: STAT_TITLE_COLOR }
                    : { border: `1px solid ${STAT_TITLE_COLOR}66`, color: 'var(--color-ink)' }
                }
              >
                {equipped ? 'Équipé' : 'Équiper'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
