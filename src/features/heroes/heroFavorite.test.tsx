import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { sortHeroes } from './useHeroes';

/**
 * HÉROS FAVORIS — l'étoile les fait remonter en tête de TOUTES les listes.
 *
 * Le tri vit dans `useHeroes` (une seule requête partagée par une vingtaine
 * d'écrans), donc c'est lui qu'on verrouille ici, plus le comportement de
 * l'étoile.
 */

const h = (id: string, favorite = false) => ({ id, favorite });

describe('sortHeroes — l’ordre canonique', () => {
  it('remonte les favoris en tête', () => {
    const out = sortHeroes([h('a'), h('b', true), h('c'), h('d', true)]);
    expect(out.map((x) => x.id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('est STABLE : à favori égal, l’ordre d’origine est conservé', () => {
    // L'ordre d'origine est `created_at, id` (l'ancienneté du héros). Un tri
    // instable ferait danser la liste d'un rendu à l'autre.
    const out = sortHeroes([h('a'), h('b'), h('c'), h('d')]);
    expect(out.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('ne MUTE pas le tableau reçu (il vient du cache react-query)', () => {
    const input = [h('a'), h('b', true)];
    sortHeroes(input);
    expect(input.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('supporte une liste vide ou sans aucun favori', () => {
    expect(sortHeroes([])).toEqual([]);
    expect(sortHeroes([h('a'), h('b')]).map((x) => x.id)).toEqual(['a', 'b']);
  });
});

/* ------------------------------------------------------------- l'étoile -- */

const mutate = vi.fn();
vi.mock('./useHeroes', async () => {
  const real = await vi.importActual<typeof import('./useHeroes')>('./useHeroes');
  return { ...real, useToggleHeroFavorite: () => ({ mutate }) };
});

const { FavStar, FavToggle } = await import('@/components/FavoriteStar');

describe('FavStar — le marqueur', () => {
  it('ne rend RIEN sur un héros ordinaire (pas de bruit dans les listes)', () => {
    const { container } = render(<FavStar on={false} />);
    expect(container.textContent).toBe('');
  });

  it('affiche une étoile pleine sur un favori', () => {
    render(<FavStar on />);
    expect(screen.getByLabelText('Favori').textContent).toBe('★');
  });
});

describe('FavToggle — l’interrupteur', () => {
  it('épingle un héros qui ne l’est pas', () => {
    mutate.mockClear();
    render(<FavToggle heroId="h1" on={false} />);
    fireEvent.click(screen.getByRole('button'));
    expect(mutate).toHaveBeenCalledWith({ heroId: 'h1', favorite: true });
  });

  it('désépingle un favori (le clic bascule, il n’ajoute pas)', () => {
    mutate.mockClear();
    render(<FavToggle heroId="h1" on />);
    fireEvent.click(screen.getByRole('button'));
    expect(mutate).toHaveBeenCalledWith({ heroId: 'h1', favorite: false });
  });

  it('n’active pas l’élément cliquable qui l’entoure', () => {
    // La carte du roster est elle-même cliquable : sans `stopPropagation`,
    // épingler un héros ouvrirait sa fiche en même temps.
    // Même forme que la vraie carte : un <div role="button"> cliquable qui
    // navigue vers la fiche (HeroCard.tsx). Un <button> imbriqué serait du HTML
    // invalide — la carte n'en est volontairement pas un.
    const openSheet = vi.fn();
    mutate.mockClear();
    render(
      <div role="button" tabIndex={0} onClick={openSheet} data-testid="card">
        <FavToggle heroId="h1" on={false} />
      </div>,
    );
    fireEvent.click(screen.getByTitle(/Épingler/));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(openSheet).not.toHaveBeenCalled();
  });
});
