/**
 * Étiquette d'un MOT-CLÉ d'effet (Égide, Épines, Marque…).
 *
 * Le lexique vit dans `@shared/progression/keywords` ; ce composant est le seul
 * rendu autorisé pour un mot-clé, afin qu'« Épines » ait exactement la même
 * apparence dans l'arbre de compétences, sur la fiche d'un héros et dans
 * l'encyclopédie. C'est ce qui permet au joueur de repérer une synergie d'un
 * coup d'œil au lieu de relire trois descriptions.
 *
 * L'infobulle porte la définition — un mot-clé sans définition à portée de
 * curseur n'est qu'un mot de plus à décoder.
 */
import { FAMILY_COLOR, type Keyword } from '@shared/progression/keywords';

export function KeywordChip({ keyword, size = 'sm' }: { keyword: Keyword; size?: 'sm' | 'xs' }) {
  const color = FAMILY_COLOR[keyword.family];
  return (
    <span
      title={`${keyword.label} — ${keyword.desc}`}
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border font-semibold ${
        size === 'xs' ? 'px-1 py-px text-[9px]' : 'px-1.5 py-0.5 text-[10px]'
      }`}
      style={{ borderColor: `${color}55`, background: `${color}14`, color }}
    >
      <span aria-hidden>{keyword.icon}</span>
      {keyword.label}
    </span>
  );
}

/** Rangée de mots-clés. Ne rend rien du tout si la liste est vide. */
export function KeywordRow({
  keywords,
  size = 'sm',
  className = '',
}: {
  keywords: Keyword[];
  size?: 'sm' | 'xs';
  className?: string;
}) {
  if (keywords.length === 0) return null;
  return (
    <span className={`flex flex-wrap items-center gap-1 ${className}`}>
      {keywords.map((k) => (
        <KeywordChip key={k.id} keyword={k} size={size} />
      ))}
    </span>
  );
}
