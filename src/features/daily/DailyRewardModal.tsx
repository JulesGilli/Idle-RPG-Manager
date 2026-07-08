import { DAILY_REWARDS } from '@shared/progression/daily';
import { getMaterialTier } from '@shared/progression/forge';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { UiIcon } from '@/components/synty/GameIcons';
import { resourceMeta } from '@/hooks/useResources';
import { useDailyReward, useClaimDaily } from './useDailyReward';

/** Zone (1..) d'un composant de forge, pour l'étiquette « Z{n} ». */
function zoneOf(materialId: string): number {
  return getMaterialTier(materialId)?.zone ?? 0;
}

export function DailyRewardModal({ onClose }: { onClose: () => void }) {
  const { data: daily } = useDailyReward();
  const claim = useClaimDaily();

  // Progression de la série courante.
  const claimedThrough = daily
    ? daily.alreadyClaimedToday
      ? daily.dayIndex
      : daily.day - 1
    : 0;
  const claimableDay = daily?.canClaim ? daily.day : null;

  return (
    <div
      className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="panel anim-pop max-h-[90vh] w-full max-w-2xl overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h3 className="font-display flex items-center gap-2 text-lg font-semibold text-[var(--color-ink)]">
            <UiIcon name="daily" size={20} /> Récompense journalière
          </h3>
          <button onClick={onClose} className="text-[var(--color-muted)] hover:text-[var(--color-ink)]">
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-[var(--color-muted)]">
          Connecte-toi chaque jour : <strong>matériaux</strong> et <strong>gemmes</strong> pour
          crafter, <strong>reliques ultimes</strong> offertes (jours 3, 6, 9), et un{' '}
          <strong>set complet ultime</strong> au <strong>jour 10</strong>. Rater un jour remet la
          série à zéro.
        </p>

        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {DAILY_REWARDS.map((r) => {
            const claimed = r.day <= claimedThrough;
            const claimable = r.day === claimableDay;
            const isSet = !!r.set;
            const isSpecial = isSet || !!r.relics;
            return (
              <div
                key={r.day}
                className={`relative flex flex-col items-center gap-1.5 rounded-xl border p-2.5 text-center transition ${
                  claimable
                    ? 'anim-pulse border-[var(--color-gold)] bg-[var(--color-gold)]/10'
                    : claimed
                      ? 'border-[var(--color-edge)] bg-[var(--color-arcane)]/10 opacity-70'
                      : isSet
                        ? 'border-[var(--color-gold)]/40 bg-black/20'
                        : r.relics
                          ? 'border-[var(--color-arcane)]/40 bg-black/20'
                          : 'border-[var(--color-edge)] bg-black/20'
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                    Jour {r.day}
                  </span>
                  {claimed && <UiIcon name="victory" size={12} />}
                </div>

                {r.set && (
                  <span className="rounded bg-[var(--color-gold)]/20 px-1.5 py-0.5 text-[9px] font-bold uppercase leading-tight tracking-wide text-[var(--color-gold-soft)]">
                    Set complet ultime · Z{zoneOf(r.set.materialId)}
                  </span>
                )}
                {r.relics && (
                  <span className="inline-flex items-center gap-1 rounded bg-[var(--color-arcane)]/15 px-1.5 py-0.5 text-[9px] font-bold uppercase leading-tight tracking-wide text-[var(--color-arcane)]">
                    <UiIcon name="relic" size={11} color="currentColor" /> 3 reliques ultimes · Z
                    {zoneOf(r.relics.materialId)}
                  </span>
                )}

                {r.materials.length > 0 && (
                  <div className="flex flex-wrap items-center justify-center gap-1">
                    {r.materials.map((m) => (
                      <span
                        key={m.key}
                        title={resourceMeta(m.key).label}
                        className="flex items-center gap-0.5 text-[10px] text-[var(--color-ink)]"
                      >
                        <ResourceIcon resKey={m.key} size={14} /> {m.qty}
                      </span>
                    ))}
                  </div>
                )}
                {!isSpecial && r.materials.length === 1 && (
                  <span className="text-[9px] leading-tight text-[var(--color-muted)]">
                    {resourceMeta(r.materials[0]!.key).label}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {claim.isError && (
          <p className="mb-2 text-sm text-[var(--color-ember)]">
            {claim.error instanceof Error ? claim.error.message : 'Erreur'}
          </p>
        )}

        {claim.data?.ok && (
          <p className="mb-2 text-sm text-[var(--color-gold-soft)]">
            Jour {claim.data.day} réclamé !{' '}
            {claim.data.items && claim.data.items.length > 0
              ? `${claim.data.items.length} objet(s) ultime(s) obtenu(s) : ${claim.data.items
                  .map((it) => it.name)
                  .join(', ')}.`
              : 'Ressources créditées.'}
          </p>
        )}

        <button
          onClick={() => claim.mutate()}
          disabled={!daily?.canClaim || claim.isPending}
          className="btn btn-primary w-full text-sm"
        >
          {claim.isPending
            ? 'Réclamation…'
            : daily?.canClaim
              ? `Réclamer le jour ${daily.day}`
              : 'Déjà réclamé aujourd’hui — reviens demain'}
        </button>
      </div>
    </div>
  );
}
