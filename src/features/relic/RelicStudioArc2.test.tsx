import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { forgeMaterialsForArc, bossMaterialsForArc } from '@shared/progression/arcMaterials';
import { arcTuning } from '@shared/progression/arc';

/**
 * LE COÛT AFFICHÉ DOIT ÊTRE LE MÊME D'UN ÉCRAN À L'AUTRE.
 *
 * L'Autel montre le coût DEUX FOIS : sur la carte de composant (étape 2), puis
 * sur l'autel (étape 3). Deux calculs distincts dans le code — et celui de
 * l'étape 2 oubliait `forgeCostMult`. En arc 2, la carte annonçait un prix et
 * l'écran suivant un autre, ×2.5 plus cher. Remonté par un joueur.
 *
 * Ce test compare les deux écrans pour de vrai : un test sur la couche pure
 * passerait au vert même avec le bug, puisque le bug était que l'UI n'appelait
 * pas la fonction.
 */

vi.mock('@/components/synty/SyntyIcon', () => ({ SyntyGlyph: () => null }));
vi.mock('@/components/synty/ResourceIcon', () => ({ ResourceIcon: () => null }));
vi.mock('@/components/synty/GameIcons', () => ({
  UiIcon: () => null,
  RelicIcon: () => null,
  SetPieceIcon: () => null,
}));
vi.mock('@/features/forge/useForge', () => ({
  useForge: () => ({
    craftRelic: { mutateAsync: vi.fn(), isPending: false },
    craftSet: { mutateAsync: vi.fn(), isPending: false },
    autoCraft: { mutateAsync: vi.fn(), isPending: false },
  }),
}));
vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ data: { gold: 99_999_999, relic_xp: 0 } }),
}));
vi.mock('@/features/release/useRelease', () => ({ useRelease: () => ({ released: true }) }));

/* Réserves d'ARC 2 à gogo : on teste l'affichage du coût, pas l'économie. */
const RES: Record<string, number> = {};
for (const m of forgeMaterialsForArc(2)) for (const x of m.materials) RES[x.key] = 999_999;
for (const b of bossMaterialsForArc(2)) RES[b.key] = 999_999;
for (const k of ['fragment_relique_profane', 'sceau_catacombe_brise', 'larme_astrale']) RES[k] = 999_999;
vi.mock('@/hooks/useResources', () => ({ useResources: () => ({ data: RES }) }));

vi.mock('@/features/arc/useArc', () => ({
  useArc: () => ({ currentArc: 2, maxArc: 2, switchArc: vi.fn(), isSwitching: false }),
}));

const { RelicStudio } = await import('./RelicStudio');

/** Tous les nombres « possédé/requis » lisibles dans un conteneur. */
function costs(root: HTMLElement): string[] {
  return (root.textContent ?? '').match(/\d+\/\d+/g) ?? [];
}

describe('Autel en Arc 2 — le coût ne change pas d’un écran à l’autre', () => {
  it('la carte de composant annonce EXACTEMENT ce que demande l’autel', () => {
    const { container } = render(<RelicStudio />);
    // Étape 1 → 2
    fireEvent.click(screen.getAllByRole('button', { name: /prioritaire/ })[0]!);

    const zone10 = forgeMaterialsForArc(2).find((m) => m.zone === 10)!;
    const carte = screen.getByRole('button', { name: new RegExp(`^${zone10.label}`) });
    const surLaCarte = costs(carte);
    expect(surLaCarte.length, 'aucun coût lisible sur la carte').toBeGreaterThan(0);

    // Étape 2 → 3 : le clic sur la carte mène à l'autel.
    fireEvent.click(carte);

    // On ne compare QUE la ligne « Coût » de l'autel : le sélecteur d'essence
    // affiche lui aussi des « possédé/requis », qui n'ont rien à voir avec la
    // recette et ne figurent pas sur la carte.
    const ligneCout = [...container.querySelectorAll('div')].find((d) =>
      (d.textContent ?? '').trimStart().startsWith('Coût'),
    );
    expect(ligneCout, 'ligne de coût introuvable sur l’autel').toBeDefined();
    const surLAutel = costs(ligneCout as HTMLElement);

    expect(surLAutel.length).toBeGreaterThan(0);
    // Chaque exigence de l'autel doit déjà figurer, à l'identique, sur la carte.
    expect(surLAutel.filter((c) => !surLaCarte.includes(c))).toEqual([]);
  });

  it('et ce coût est bien celui de l’arc 2, pas le brut', () => {
    // Sans quoi les deux écrans pourraient s'accorder… sur le mauvais prix.
    expect(arcTuning(2).forgeCostMult).toBeGreaterThan(1);
    render(<RelicStudio />);
    fireEvent.click(screen.getAllByRole('button', { name: /prioritaire/ })[0]!);

    const zone10 = forgeMaterialsForArc(2).find((m) => m.zone === 10)!;
    const carte = screen.getByRole('button', { name: new RegExp(`^${zone10.label}`) });
    const brut = zone10.materials[0]!.qty;
    const attendu = Math.max(1, Math.round(brut * arcTuning(2).forgeCostMult));
    expect(brut).not.toBe(attendu); // sinon le test ne prouverait rien
    expect(costs(carte).some((c) => c.endsWith(`/${attendu}`))).toBe(true);
  });
});
