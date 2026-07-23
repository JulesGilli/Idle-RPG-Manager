import { UiIcon } from '@/components/synty/GameIcons';
import { useDonate } from './useDonate';

/**
 * BOUTON DE SOUTIEN — ouvre une page de don externe.
 *
 * Ne rend RIEN tant qu'aucune URL n'est configurée (`app_config.donate_url`) :
 * le jeu ne doit pas afficher un bouton mort, ni quémander avant que la page
 * existe.
 *
 * `rel="noopener noreferrer"` : sans `noopener`, la page ouverte garde une
 * référence sur l'onglet du jeu (`window.opener`) et peut le rediriger.
 */
export function DonateButton({ compact = false }: { compact?: boolean }) {
  const { data } = useDonate();
  if (!data?.url) return null;

  if (compact) {
    // Mêmes classes que `BurgerLink` (icône dans un conteneur h-6 w-6 centré,
    // gap-3 px-4 py-3) : sinon cette ligne est seule à ne pas s'aligner sur
    // celle des autres entrées du menu burger.
    return (
      <a
        href={data.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-[var(--color-ink)] transition hover:bg-white/5"
      >
        <span className="flex h-6 w-6 items-center justify-center">
          <UiIcon name="heart" size={16} color="var(--color-ember)" />
        </span>
        {data.label}
      </a>
    );
  }

  return (
    <div className="panel p-5">
      <h3 className="heading mb-1 flex items-center gap-2 text-lg">
        <UiIcon name="heart" size={18} color="var(--color-ember)" />
        {data.label}
      </h3>
      <p className="mb-3 text-sm text-[var(--color-muted)]">
        Le jeu est gratuit et le restera. Si tu veux soutenir son développement et payer les
        serveurs, tu peux laisser un don — <strong className="text-[var(--color-ink)]">sans
        aucune contrepartie en jeu</strong> : rien à gagner, aucun avantage, aucun bonus. Ceux qui
        ne donnent pas ne perdent rien.
      </p>
      <a
        href={data.url}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-primary inline-flex text-sm"
      >
        <UiIcon name="heart" size={14} color="currentColor" />
        {data.label}
      </a>
    </div>
  );
}
