import { TYPE_BONUS_LABEL } from '@shared/progression/forge';

/** Couleur par type d'amplificateur — distincte du passif (toujours arcane)
    pour qu'on ne confonde pas les deux d'un coup d'œil. */
const TYPE_BONUS_COLOR: Record<'physical' | 'magical' | 'heal', string> = {
  physical: '#fb7185',
  magical: '#7c6cff',
  heal: '#5fd39b',
};

/**
 * Amplificateur de type d'une arme : +X % dégâts physiques/magiques (ou soin).
 * Partagé par l'inventaire et la fiche de héros — même chip partout où une
 * arme est affichée, jamais visible qu'au moment du craft.
 */
export function TypeBonusChip({ kind, pct }: { kind: 'physical' | 'magical' | 'heal'; pct: number }) {
  const color = TYPE_BONUS_COLOR[kind];
  const pctLabel = Math.round(pct * 100);
  const title =
    kind === 'heal'
      ? `Amplificateur de type de l'arme : +${pctLabel}% sur les soins prodigués`
      : `Amplificateur de type de l'arme : +${pctLabel}% de dégâts ${TYPE_BONUS_LABEL[kind].toLowerCase()}s`;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold text-[var(--color-ink)]"
      style={{ borderColor: `${color}40`, background: `${color}15` }}
      title={title}
    >
      {TYPE_BONUS_LABEL[kind]} <span style={{ color }}>+{pctLabel}%</span>
    </span>
  );
}
