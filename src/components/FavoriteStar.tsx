import { useToggleHeroFavorite } from '@/features/heroes/useHeroes';

/**
 * ÉTOILE DE FAVORI.
 *
 * Deux usages, une seule apparence — un favori doit se reconnaître au même
 * signe partout :
 *
 *  • `<FavStar on={h.favorite} />` — MARQUEUR, dans les listes et sélecteurs.
 *    Purement décoratif : rien à cliquer au milieu d'un bouton de sélection
 *    d'équipe, où le clic doit rester celui du choix du héros.
 *  • `<FavToggle heroId={…} on={…} />` — INTERRUPTEUR, sur la fiche du héros et
 *    la carte du roster. C'est là qu'on épingle.
 *
 * Le tri, lui, ne vit pas ici : il est fait une fois pour toutes dans
 * `useHeroes` (`sortHeroes`), donc toutes les listes en héritent.
 */

/** Marqueur non cliquable. Ne rend rien si le héros n'est pas favori. */
export function FavStar({ on, size = 11 }: { on: boolean; size?: number }) {
  if (!on) return null;
  return (
    <span
      aria-label="Favori"
      title="Favori — toujours en tête de liste"
      className="mr-1 inline-block shrink-0 align-middle leading-none text-[var(--color-gold-soft)]"
      style={{ fontSize: size }}
    >
      ★
    </span>
  );
}

/**
 * Interrupteur. `stopPropagation` obligatoire : la carte du roster est
 * elle-même cliquable (elle ouvre la fiche), et sans ça épingler un héros
 * naviguerait en même temps.
 */
export function FavToggle({
  heroId,
  on,
  size = 16,
  className = '',
}: {
  heroId: string;
  on: boolean;
  size?: number;
  className?: string;
}) {
  const toggle = useToggleHeroFavorite();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle.mutate({ heroId, favorite: !on });
      }}
      aria-pressed={on}
      title={on ? 'Retirer des favoris' : 'Épingler en favori (toujours en tête de liste)'}
      className={`shrink-0 leading-none transition hover:scale-110 ${
        on ? 'text-[var(--color-gold-soft)]' : 'text-[var(--color-muted)] hover:text-[var(--color-gold-soft)]'
      } ${className}`}
      style={{ fontSize: size }}
    >
      {on ? '★' : '☆'}
    </button>
  );
}
