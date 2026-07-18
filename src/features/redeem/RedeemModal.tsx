import { useState } from 'react';
import { describeReward } from '@shared/progression/redeem';
import { UiIcon } from '@/components/synty/GameIcons';
import { RedeemTicketIcon } from '@/components/icons/AppSvgIcons';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { resourceMeta } from '@/hooks/useResources';
import { useMyRedeems, useRedeemCode } from './useRedeem';

export function RedeemModal({ onClose }: { onClose: () => void }) {
  const { data: claims } = useMyRedeems();
  const redeem = useRedeemCode();
  const [code, setCode] = useState('');

  function submit() {
    const c = code.trim();
    if (!c || redeem.isPending) return;
    redeem.mutate(c, { onSuccess: () => setCode('') });
  }

  return (
    <div
      className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="panel anim-pop max-h-[90vh] w-full max-w-md overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h3 className="font-display flex items-center gap-2 text-lg font-semibold text-[var(--color-ink)]">
            <RedeemTicketIcon size={20} color="#5fd39b" /> Codes de récompense
          </h3>
          <button onClick={onClose} className="text-[var(--color-muted)] hover:text-[var(--color-ink)]">
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-[var(--color-muted)]">
          Saisis un code pour débloquer une <strong>récompense exclusive</strong>. Chaque code n'est
          utilisable qu'<strong>une seule fois</strong> par compte.
        </p>

        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="TON-CODE"
            className="flex-1 rounded-lg border border-[var(--color-edge)] bg-black/30 px-3 py-2 text-sm uppercase tracking-wider text-[var(--color-ink)] outline-none focus:border-[var(--color-arcane)]"
          />
          <button
            onClick={submit}
            disabled={!code.trim() || redeem.isPending}
            className="btn btn-primary text-sm"
          >
            {redeem.isPending ? '…' : 'Valider'}
          </button>
        </div>

        {redeem.isError && (
          <p className="mt-2 text-sm text-[var(--color-ember)]">
            {redeem.error instanceof Error ? redeem.error.message : 'Erreur'}
          </p>
        )}
        {redeem.data?.ok && (
          <p className="mt-2 text-sm text-[var(--color-gold-soft)]">
            Récompense obtenue : {describeReward(redeem.data.reward).join(', ') || 'reçue'}
            {redeem.data.item ? ` (${redeem.data.item.name})` : ''}
            {redeem.data.relics?.length
              ? ` (${redeem.data.relics.map((r) => r.name).join(', ')})`
              : ''}{' '}
            !
          </p>
        )}

        {(claims ?? []).length > 0 && (
          <div className="mt-5">
            <div className="mb-1 text-xs font-semibold text-[var(--color-muted)]">
              Codes déjà utilisés
            </div>
            <div className="space-y-1.5">
              {(claims ?? []).map((c) => (
                <div
                  key={c.code}
                  className="flex items-center justify-between rounded-lg border border-[var(--color-edge)] bg-black/20 px-2.5 py-1.5 text-xs"
                >
                  <span className="font-mono font-semibold uppercase tracking-wider text-[var(--color-ink)]">
                    {c.code}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5 text-[var(--color-muted)]">
                    {(c.granted.materials ?? []).map((m) => (
                      <span key={m.key} title={resourceMeta(m.key).label} className="inline-flex items-center gap-0.5">
                        <ResourceIcon resKey={m.key} size={12} /> {m.qty}
                      </span>
                    ))}
                    {c.granted.gold ? (
                      <span className="inline-flex items-center gap-0.5 text-[var(--color-gold-soft)]">
                        <UiIcon name="gold" size={12} /> {c.granted.gold}
                      </span>
                    ) : null}
                    {c.granted.item && <span className="text-[var(--color-gold-soft)]">◆ item</span>}
                    {c.granted.relics?.length ? (
                      <span className="text-[var(--color-arcane)]">◆ relique</span>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
