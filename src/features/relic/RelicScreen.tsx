import { useState } from 'react';
import { RELIC_BASES } from '@shared/progression/relic';
import { SETS, SET_PIECES, setPieceGated } from '@shared/progression/sets';
import { useRelease } from '@/features/release/useRelease';
import { UiIcon, RelicIcon, ItemTypeIcon } from '@/components/synty/GameIcons';
import { CraftItemCard } from '@/features/forge/CraftItemCard';
import { SetCraftModal } from '@/features/forge/SetCraftModal';
import { RelicCraftModal } from './RelicCraftModal';
import { BackToVillage } from '@/components/BackToVillage';

/**
 * Autel des Reliques — même parcours que la Forge : une liste d'items à fabriquer
 * (reliques normales + pièces de set), un clic ouvre la fenêtre de craft où l'on
 * choisit les matériaux (pour les reliques normales).
 */
export function RelicScreen() {
  const [openId, setOpenId] = useState<string | null>(null);
  const { released } = useRelease();
  // Masque les pièces de set encore verrouillées (sortie V1.1) avant l'heure.
  const setPieces = SET_PIECES.filter((p) => p.slot === 'relic' && (released || !setPieceGated(p.id)));
  const openBase = RELIC_BASES.find((b) => b.id === openId) ?? null;
  const openSet = setPieces.find((p) => p.id === openId) ?? null;

  return (
    <section className="anim-fade space-y-5">
      <BackToVillage />

      <div>
        <h2 className="heading flex items-center gap-2 text-2xl">
          <UiIcon name="relic" size={24} color="var(--color-gold-soft)" />
          Autel des Reliques
        </h2>
        <p className="text-sm text-[var(--color-muted)]">
          Choisis une relique à façonner : la fenêtre de craft s'ouvre pour sélectionner le composant
          (zone, tier) qui détermine ses stats brutes. Renforcées par le butin des donjons.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {RELIC_BASES.map((b) => (
          <CraftItemCard
            key={b.id}
            onClick={() => setOpenId(b.id)}
            icon={<RelicIcon baseId={b.id} size={26} />}
            name={b.label}
          />
        ))}
        {setPieces.map((p) => (
          <CraftItemCard
            key={p.id}
            onClick={() => setOpenId(p.id)}
            icon={<ItemTypeIcon type="relic" size={24} color="var(--color-muted)" />}
            name={p.label}
            badge={SETS.find((s) => s.id === p.setId)?.name ?? 'Set'}
          />
        ))}
      </div>

      {openBase && <RelicCraftModal base={openBase} onClose={() => setOpenId(null)} />}
      {openSet && <SetCraftModal piece={openSet} onClose={() => setOpenId(null)} />}
    </section>
  );
}
