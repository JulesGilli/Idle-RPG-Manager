import { UiIcon } from '@/components/synty/GameIcons';

/**
 * Règle des passifs d'équipement, dite EXPLICITEMENT là où le joueur dépense
 * pour en obtenir un : la Forge Sacrée (arme/armure divine) et la Joaillerie
 * (bijou). Sertir la même gemme deux fois ne double pas l'effet — c'est le genre
 * de règle qui se découvre trop tard, après avoir grillé deux gemmes.
 *
 * Un seul composant pour les deux écrans : deux formulations séparées, c'est la
 * garantie qu'un futur ajustement n'en corrige qu'une.
 */
export function PassiveStackNotice() {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-[var(--color-arcane)]/35 bg-[var(--color-arcane)]/[0.07] p-2.5 text-[11px] leading-relaxed text-[var(--color-ink)]/80">
      <span className="mt-px shrink-0 text-[var(--color-arcane)]">
        <UiIcon name="warning" size={13} />
      </span>
      <span>
        Les passifs de gemme <strong>ne se cumulent pas</strong> entre eux : arme, armure, bijou et
        relique portant le <strong>même</strong> passif ne comptent qu'
        <strong>une seule fois</strong>, à la valeur la plus forte. Pour empiler des effets, varie
        les gemmes. (Les passifs d'<strong>arbre de compétences</strong>, eux, s'ajoutent.)
      </span>
    </p>
  );
}
