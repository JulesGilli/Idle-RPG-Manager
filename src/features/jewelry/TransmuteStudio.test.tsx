import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';

/* Icônes Synty : SVG distants, hors sujet ici. */
vi.mock('@/components/synty/ResourceIcon', () => ({ ResourceIcon: () => null }));
vi.mock('@/components/synty/GameIcons', () => ({ PassiveIcon: () => null, UiIcon: () => null }));

const transmuteMutate = vi.fn();
vi.mock('@/features/forge/useForge', () => ({
  useForge: () => ({ transmuteGem: { mutate: transmuteMutate, isPending: false } }),
}));

/* Stock pilotable par test : c'est LUI qui décide de ce que l'écran propose. */
let RES: Record<string, number> = {};
vi.mock('@/hooks/useResources', async () => {
  const real = await vi.importActual<typeof import('@/hooks/useResources')>('@/hooks/useResources');
  return { ...real, useResources: () => ({ data: RES }) };
});

vi.mock('@/features/arc/useArc', () => ({
  useArc: () => ({ currentArc: 1, maxArc: 1, switchArc: vi.fn(), isSwitching: false }),
}));

const { TransmuteStudio } = await import('./TransmuteStudio');

const btn = (name: RegExp) => screen.getByRole('button', { name });

beforeEach(() => {
  RES = {};
  transmuteMutate.mockReset();
});
afterEach(cleanup);

describe('TransmuteStudio', () => {
  it('annonce le composant de la ZONE CIBLE, pas celui de la gemme sacrifiée', () => {
    // Gemme de Venin (zone 4) en stock, cible par défaut = Gemme Astrale (zone 10).
    RES = { gemme_venin: 5, poussiere_etoile: 100 };
    render(<TransmuteStudio />);

    // Le bouton nomme explicitement ce qu'on obtient.
    expect(btn(/Transmuter en Gemme Astrale/)).toBeEnabled();
    // Et l'équation exige le composant de la zone 10.
    expect(screen.getByText("Poussière d'étoile")).toBeInTheDocument();
    expect(screen.queryByText('Essence des marais')).not.toBeInTheDocument();
  });

  it('choisit d’office la gemme dont on a le PLUS d’exemplaires', () => {
    RES = { gemme_seve: 3, gemme_venin: 9, gemme_glace: 2, poussiere_etoile: 100 };
    render(<TransmuteStudio />);

    fireEvent.click(btn(/Transmuter en/));
    expect(transmuteMutate).toHaveBeenCalledWith(
      { gemId: 'gemme_venin', targetGemId: 'gemme_astrale' },
      expect.anything(),
    );
  });

  it('bloque et DIT ce qui manque quand les composants sont insuffisants', () => {
    RES = { gemme_venin: 5, poussiere_etoile: 12 };
    render(<TransmuteStudio />);

    expect(btn(/Transmuter en/)).toBeDisabled();
    expect(screen.getByText(/Il te manque 18 Poussière d'étoile/)).toBeInTheDocument();
  });

  it('bloque quand aucune gemme n’est possédée en double', () => {
    RES = { gemme_venin: 1, gemme_seve: 1, poussiere_etoile: 100 };
    render(<TransmuteStudio />);

    expect(btn(/Transmuter en/)).toBeDisabled();
    // Le message d'erreur, pas l'aide de la section (qui porte une phrase proche).
    expect(screen.getByText(/Il te faut 2 exemplaires/)).toBeInTheDocument();
  });

  it('ne propose jamais la cible comme sacrifice, même après changement de cible', () => {
    RES = { gemme_venin: 9, gemme_seve: 4, poussiere_etoile: 100, spore: 100 };
    render(<TransmuteStudio />);

    // On sacrifie le Venin, puis on prend le Venin POUR CIBLE : l'écran doit
    // retomber sur une autre source au lieu de rester sur un état absurde
    // (sacrifier exactement ce qu'on veut obtenir), que le serveur refuserait.
    const sacrifices = within(screen.getByText(/Les gemmes que tu sacrifies/).closest('div.panel')!);
    fireEvent.click(sacrifices.getByRole('button', { name: /Gemme de Venin/ }));

    const wanted = within(screen.getByText(/La gemme que tu veux/).closest('div.panel')!);
    fireEvent.click(wanted.getByRole('button', { name: /Gemme de Venin/ }));

    fireEvent.click(btn(/Transmuter en Gemme de Venin/));
    expect(transmuteMutate).toHaveBeenCalledWith(
      { gemId: 'gemme_seve', targetGemId: 'gemme_venin' },
      expect.anything(),
    );
  });

  it('grise les gemmes qu’on ne possède pas en assez d’exemplaires', () => {
    RES = { gemme_venin: 9, gemme_seve: 1, poussiere_etoile: 100 };
    render(<TransmuteStudio />);

    const sacrifices = within(screen.getByText(/Les gemmes que tu sacrifies/).closest('div.panel')!);
    expect(sacrifices.getByRole('button', { name: /Gemme de Sève/ })).toBeDisabled();
    expect(sacrifices.getByRole('button', { name: /Gemme de Venin/ })).toBeEnabled();
  });
});
