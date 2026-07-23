import { DAILY_KIND_CYCLE, type DailyRewardKind } from '@shared/progression/daily';
import { FORGE_BASES } from '@shared/progression/forge';
import { RELIC_BASES } from '@shared/progression/relic';
import { UiIcon } from '@/components/synty/GameIcons';
import { DailyRewardIcon } from '@/components/icons/AppSvgIcons';
import { useDailyReward, useClaimDaily } from './useDailyReward';

/** Nombre de modèles offerts par un lot (8 armes, 3 armures, 3 reliques). */
function lotSize(kind: DailyRewardKind): number {
  if (kind === 'relic') return RELIC_BASES.length;
  return FORGE_BASES.filter((b) => b.itemType === kind).length;
}

const KIND_LABEL: Record<DailyRewardKind, string> = {
  weapon: 'Armes',
  armor: 'Armures',
  relic: 'Reliques',
};

const KIND_STYLE: Record<DailyRewardKind, string> = {
  weapon: 'bg-[var(--color-ember)]/15 text-[var(--color-ember)]',
  armor: 'bg-[var(--color-gold)]/15 text-[var(--color-gold-soft)]',
  relic: 'bg-[var(--color-arcane)]/15 text-[var(--color-arcane)]',
};

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
        className="panel anim-pop max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h3 className="font-display flex items-center gap-2 text-lg font-semibold text-[var(--color-ink)]">
            <DailyRewardIcon size={20} color="var(--color-gold-soft)" /> Récompense journalière
          </h3>
          <button onClick={onClose} className="text-[var(--color-muted)] hover:text-[var(--color-ink)]">
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-[var(--color-muted)]">
          Connecte-toi chaque jour : un <strong>lot d’équipement ultime</strong> offert — toutes les{' '}
          <strong>armes</strong>, toutes les <strong>armures</strong>, ou les 3 <strong>reliques</strong>,
          au tour par tour. La <strong>zone</strong> du lot suit ta progression réelle : c'est toujours
          celle où tu es allé le plus loin dans ton arc actuel. Rater un jour remet la série à zéro.
        </p>

        <div className="mb-4 grid grid-cols-3 gap-2">
          {DAILY_KIND_CYCLE.map((kind, i) => {
            const day = i + 1;
            const claimed = day <= claimedThrough;
            const claimable = day === claimableDay;
            return (
              <div
                key={day}
                className={`relative flex flex-col items-center gap-1.5 rounded-xl border p-2.5 text-center transition ${
                  claimable
                    ? 'anim-pulse border-[var(--color-gold)] bg-[var(--color-gold)]/10'
                    : claimed
                      ? 'border-[var(--color-edge)] bg-[var(--color-arcane)]/10 opacity-70'
                      : 'border-[var(--color-edge)] bg-black/20'
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                    Jour {day}
                  </span>
                  {claimed && <UiIcon name="victory" size={12} />}
                </div>

                <span
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase leading-tight tracking-wide ${KIND_STYLE[kind]}`}
                >
                  {lotSize(kind)} {KIND_LABEL[kind].toLowerCase()}
                </span>
                <span className="text-[9px] leading-tight text-[var(--color-muted)]">
                  Ultimes · ta zone
                </span>
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
            Jour {claim.data.day} réclamé — zone {claim.data.zone} !{' '}
            {claim.data.items && claim.data.items.length > 0
              ? `${claim.data.items.length} objet(s) ultime(s) obtenu(s) : ${claim.data.items
                  .map((it) => it.name)
                  .join(', ')}.`
              : 'Aucun objet reçu — signale-le.'}
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
