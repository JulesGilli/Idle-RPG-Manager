import { useTitlesStatus, useEquipTitle } from './useAchievements';
import { ACHIEVEMENTS, type AchievementCategory } from '@shared/progression/achievements';
import { UiIcon } from '@/components/synty/GameIcons';
import { BackToVillage } from '@/components/BackToVillage';

const CATEGORY_LABEL: Record<AchievementCategory, string> = {
  progression: 'Progression',
  collection: 'Collection',
  pvp: 'Arène',
  maitrise: 'Maîtrise',
};

const CATEGORY_ORDER: AchievementCategory[] = ['progression', 'collection', 'pvp', 'maitrise'];

export function AchievementsScreen() {
  const { data: status, isLoading } = useTitlesStatus();
  const equip = useEquipTitle();

  const unlocked = new Set(status?.unlocked ?? []);
  const currentTitle = status?.title ?? null;
  const doneCount = unlocked.size;

  return (
    <section className="anim-fade space-y-5">
      <BackToVillage />

      <div className="panel p-5">
        <h2 className="heading flex items-center gap-2 text-xl">
          <UiIcon name="book" size={22} color="var(--color-gold-soft)" />
          Succès & Titres
        </h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Débloque des succès en jouant et équipe le titre de ton choix parmi ceux obtenus.
          {!isLoading && (
            <> {' '}<span className="font-semibold text-[var(--color-ink)]">{doneCount}/{ACHIEVEMENTS.length}</span> débloqués.</>
          )}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-[var(--color-muted)]">Titre équipé :</span>
          {currentTitle ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-[var(--color-gold-soft)]/15 px-3 py-1 font-semibold text-[var(--color-gold-soft)]">
              « {currentTitle} »
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
                      done ? 'border-[var(--color-gold-soft)]/40 bg-[var(--color-gold-soft)]/[0.05]' : 'border-[var(--color-edge)] opacity-70'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <UiIcon name={done ? 'victory' : 'lock'} size={13} color={done ? 'var(--color-gold-soft)' : 'var(--color-muted)'} />
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
    </section>
  );
}
