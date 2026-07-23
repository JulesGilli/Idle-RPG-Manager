import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { forgeMaterialsForArc, bossMaterialsForArc } from '@shared/progression/arcMaterials';
import { BOSS_MATERIALS, craftRecipe } from '@shared/progression/forge';
import { scaleRecipeForArc } from '@shared/progression/arc';

/**
 * LA FORGE VUE PAR UN JOUEUR D'ARC 2.
 *
 * Elle affichait le catalogue et les coûts de l'ARC 1 : essences introuvables
 * dans son inventaire, quantités inférieures à ce que le serveur prélève.
 */

vi.mock('@/components/synty/SyntyIcon', () => ({ SyntyGlyph: () => null }));
vi.mock('@/components/synty/ResourceIcon', () => ({ ResourceIcon: () => null }));
vi.mock('@/components/synty/GameIcons', () => ({
  UiIcon: () => null,
  ItemTypeIcon: () => null,
  SetPieceIcon: () => null,
}));
vi.mock('./useForge', () => ({
  useForge: () => ({
    craft: { mutateAsync: vi.fn(), isPending: false },
    craftSet: { mutateAsync: vi.fn(), isPending: false },
    autoCraft: { mutateAsync: vi.fn(), isPending: false },
  }),
}));
vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ data: { gold: 99_999_999, forge_xp: 0 } }),
}));

/* Réserves d'arc 2 uniquement — c'est ce que `useResources` remonte à l'arc 2. */
const RES: Record<string, number> = {};
for (const m of forgeMaterialsForArc(2)) for (const x of m.materials) RES[x.key] = 99_999;
for (const b of bossMaterialsForArc(2)) RES[b.key] = 99_999;
vi.mock('@/hooks/useResources', () => ({ useResources: () => ({ data: RES }) }));

vi.mock('@/features/arc/useArc', () => ({
  useArc: () => ({ currentArc: 2, maxArc: 2, switchArc: vi.fn(), isSwitching: false }),
}));

const { CraftStudio } = await import('./CraftStudio');

/** Va jusqu'à l'enclume : plan (étape 1) → matériau (étape 2) → étape 3. */
function goToAnvil() {
  render(<CraftStudio />);
  fireEvent.click(screen.getAllByText(/Épée/)[0]!.closest('button')!);
  const zone10 = forgeMaterialsForArc(2).find((m) => m.zone === 10)!;
  fireEvent.click(screen.getByText(zone10.label).closest('button')!);
}

describe('Forge — un joueur d’Arc 2 ne voit que de l’Arc 2', () => {
  it('les essences proposées sont celles de l’Arc 2', () => {
    goToAnvil();
    const titles = Array.from(document.querySelectorAll('button[title]')).map(
      (b) => b.getAttribute('title') ?? '',
    );
    for (const b of bossMaterialsForArc(2)) {
      expect(titles.some((t) => t.startsWith(b.label)), `${b.label} absente`).toBe(true);
    }
    // Aucune essence d'arc 1 : le joueur n'en possède pas et le serveur les refuse.
    for (const b of BOSS_MATERIALS) {
      expect(titles.some((t) => t.startsWith(b.label)), `${b.label} (arc 1) proposée`).toBe(false);
    }
  });

  it('la quantité annoncée est celle que le serveur prélèvera (forgeCostMult)', () => {
    goToAnvil();
    const zone10 = forgeMaterialsForArc(2).find((m) => m.zone === 10)!;
    const expected = scaleRecipeForArc(craftRecipe(zone10, null), 2).materials[0]!.qty;
    const raw = craftRecipe(zone10, null).materials[0]!.qty;
    expect(expected).toBeGreaterThan(raw); // sinon le test ne prouverait rien
    expect(screen.getAllByText(new RegExp(`/${expected}$`)).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(new RegExp(`/${raw}$`))).toHaveLength(0);
  });
});
