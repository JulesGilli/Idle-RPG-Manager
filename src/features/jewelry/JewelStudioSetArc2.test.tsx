import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { forgeMaterialsForArc, gemsForArc } from '@shared/progression/arcMaterials';
import { jewelPct } from '@shared/progression/jewelry';
import { setPieceRecipe, SET_PIECES, SETS, setArc } from '@shared/progression/sets';
import { scaleRecipeForArc } from '@shared/progression/arc';

/**
 * PIÈCE DE SET EN ARC 2 — deux retours joueur :
 *  1. le « butin signature » affichait les quantités BRUTES (arc 1) sous un total
 *     scalé (arc 2) — deux chiffres pour un même craft ;
 *  2. sertir une gemme n'annonçait pas le passif obtenu.
 */

vi.mock('@/components/synty/SyntyIcon', () => ({ SyntyGlyph: () => null }));
vi.mock('@/components/synty/ResourceIcon', () => ({ ResourceIcon: () => null }));
vi.mock('@/components/synty/GameIcons', () => ({
  UiIcon: () => null,
  PassiveIcon: () => null,
  SetPieceIcon: () => null,
  ItemTypeIcon: () => null,
}));
vi.mock('@/features/forge/useForge', () => ({
  useForge: () => ({
    craftJewel: { mutateAsync: vi.fn(), isPending: false },
    craftSet: { mutateAsync: vi.fn(), isPending: false },
    autoCraft: { mutateAsync: vi.fn(), isPending: false },
  }),
}));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ data: { gold: 9e8, jewel_xp: 0 } }) }));
vi.mock('@/features/release/useRelease', () => ({ useRelease: () => ({ released: true }) }));

const RES: Record<string, number> = {};
for (const m of forgeMaterialsForArc(2)) for (const x of m.materials) RES[x.key] = 9e5;
for (const g of gemsForArc(2)) RES[g.id] = 99;
for (const k of ['seve_corrompue', 'ambre_mort', 'foudre_noire', 'sceau_catacombe_brise']) RES[k] = 9e5;
vi.mock('@/hooks/useResources', () => ({ useResources: () => ({ data: RES }) }));
vi.mock('@/features/arc/useArc', () => ({
  useArc: () => ({ currentArc: 2, maxArc: 2, switchArc: vi.fn(), isSwitching: false }),
}));

const { JewelStudio } = await import('./JewelStudio');

/** Première pièce de set d'arc 2 forgeable en Joaillerie (bijou), + son set. */
const arc2Piece = (() => {
  const ids = new Set(SETS.filter((s) => setArc(s) === 2).map((s) => s.id));
  return SET_PIECES.find((p) => p.slot === 'jewel' && ids.has(p.setId))!;
})();
const arc2SetName = SETS.find((s) => s.id === arc2Piece.setId)!.name;

/** Sélectionne le set (étape 1) : sa carte porte le nom de la pièce ET du set. */
function pickSet() {
  fireEvent.click(screen.getByRole('button', { name: /^Sets$/ }));
  fireEvent.click(
    [...document.querySelectorAll('button')].find(
      (b) =>
        (b.textContent ?? '').includes(arc2Piece.label) &&
        (b.textContent ?? '').includes(arc2SetName),
    )!,
  );
}

/** Choisit le composant (chips « T2 Z1 ») et arrive à l'établi. */
function pickComponent() {
  fireEvent.click(
    [...document.querySelectorAll('button')].find((b) => /T\d\s*Z\d/.test(b.textContent ?? ''))!,
  );
}

/**
 * Flux SET complet jusqu'à l'établi : Sets → pièce → gemme → composant.
 * L'étape gemme est nouvelle : sans clic dessus (« Aucune » ou une gemme), le
 * composant ne s'affiche pas.
 */
function goToBench() {
  const rendered = render(<JewelStudio />);
  pickSet();
  fireEvent.click(screen.getByRole('button', { name: /^Aucune gemme$/ }));
  pickComponent();
  return rendered;
}

const nums = (el: Element | null): string[] => (el?.textContent ?? '').match(/\d+\/\d+/g) ?? [];

describe('Joaillerie — pièce de set en Arc 2', () => {
  it('le butin signature vit DANS la ligne de coût, plus dans un bloc dupliqué', () => {
    const { container } = goToBench();
    const coutRow = [...container.querySelectorAll('div')].find((d) =>
      (d.textContent ?? '').trimStart().startsWith('Coût'),
    );
    expect(coutRow, 'ligne de coût introuvable').toBeDefined();
    // Un seul encart : la ligne de coût porte l'étiquette « Signature »…
    expect(coutRow!.textContent).toMatch(/Signature/);
    // …et l'ancien bloc « à ajouter » a bien disparu (fini la duplication).
    expect(container.textContent).not.toMatch(/signature à ajouter/i);
    // Les quantités du coût couvrent bien tout le butin de la recette scalée.
    const mat = forgeMaterialsForArc(2)[0]!;
    const scaled = scaleRecipeForArc(setPieceRecipe(arc2Piece, mat), 2);
    const shown = nums(coutRow!);
    for (const m of scaled.materials) {
      const owned = shown.some((c) => c.endsWith(`/${m.qty}`));
      expect(owned, `${m.key} ×${m.qty} absent de la ligne de coût`).toBe(true);
    }
  });

  it('sertir une gemme annonce le passif obtenu, à sa valeur exacte', () => {
    // La gemme sertie est désormais sa PROPRE étape (2), entre le set et le
    // composant : Sets → pièce → gemme → composant → établi.
    const { container } = render(<JewelStudio />);
    pickSet();
    const gemBtn = [...document.querySelectorAll('button')].find((b) =>
      /Régénération/i.test(b.textContent ?? ''),
    );
    expect(gemBtn, 'étape gemme absente après le choix du set').toBeDefined();
    fireEvent.click(gemBtn!);
    pickComponent();

    // La pièce de set sort toujours ultime : c'est la valeur à annoncer.
    const gem = gemsForArc(2).find((g) => g.passive === 'regen')!;
    const mat = forgeMaterialsForArc(2)[0]!;
    const expected = `+${jewelPct(mat, gem, 'ultimate')}%`;
    expect(container.textContent).toContain(expected);
  });
});

describe('cohérence pure coût/signature (garde-fou)', () => {
  it('la signature est un SOUS-ENSEMBLE exact de la recette scalée', () => {
    const mat = forgeMaterialsForArc(2).at(-1)!;
    const scaled = scaleRecipeForArc(setPieceRecipe(arc2Piece, mat), 2);
    const zoneKeys = new Set(mat.materials.map((x) => x.key));
    const sig = scaled.materials.filter((m) => !zoneKeys.has(m.key));
    for (const m of sig) {
      expect(scaled.materials.find((x) => x.key === m.key)!.qty).toBe(m.qty);
    }
  });
});

describe('Joaillerie — flux de craft', () => {
  it('le set a QUATRE étapes : set → gemme → composant → sertir', () => {
    const { container } = render(<JewelStudio />);
    fireEvent.click(screen.getByRole('button', { name: /^Sets$/ }));
    const labels = [...container.querySelectorAll('button')]
      .map((b) => (b.textContent ?? '').replace(/\s+/g, ' ').trim())
      .filter((t) => /^[1-4](Le set|La gemme|Le composant|Sertir)/.test(t));
    // Le stepper porte bien les quatre libellés, dans l'ordre.
    expect(labels.some((t) => t.startsWith('1Le set'))).toBe(true);
    expect(labels.some((t) => t.startsWith('2La gemme'))).toBe(true);
    expect(labels.some((t) => t.startsWith('3Le composant'))).toBe(true);
    expect(labels.some((t) => t.startsWith('4Sertir'))).toBe(true);
  });

  it('la gemme (bijou simple) garde TROIS étapes : gemme → composant → sertir', () => {
    const { container } = render(<JewelStudio />);
    // Onglet Gemmes actif par défaut.
    const labels = [...container.querySelectorAll('button')]
      .map((b) => (b.textContent ?? '').replace(/\s+/g, ' ').trim())
      .filter((t) => /^[1-4](La gemme|Le composant|Sertir|Le set)/.test(t));
    expect(labels.some((t) => t.startsWith('1La gemme'))).toBe(true);
    expect(labels.some((t) => t.startsWith('3Sertir'))).toBe(true);
    expect(labels.some((t) => t.startsWith('Le set') || /^4/.test(t))).toBe(false);
  });
});
