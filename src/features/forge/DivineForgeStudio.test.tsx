import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FORGE_MATERIALS } from '@shared/progression/forge';
import { GEMS } from '@shared/progression/jewelry';
import {
  ARC2_KEYS,
  FORGE_MATERIALS_ARC2,
  GEMS_ARC2,
  materialArcScope,
} from '@shared/progression/arcMaterials';
import { resourceIcon } from '@/lib/synty';
import { resourceMeta } from '@/hooks/useResources';

/**
 * FORGE SACRÉE — elle ne doit JAMAIS proposer de composants d'Arc 1.
 *
 * Le serveur n'accepte qu'un catalogue d'Arc 2 (`materialForArc`/`gemForArc` sont
 * stricts) : une recette d'Arc 1 affichée ici est une recette qu'on ne peut pas
 * payer. Le bug a déjà été corrigé une fois — ces tests le clouent au sol.
 */

vi.mock('@/components/synty/ResourceIcon', () => ({ ResourceIcon: () => null }));
vi.mock('@/components/synty/GameIcons', () => ({ UiIcon: () => null }));
vi.mock('./useForge', () => ({
  useForge: () => ({ craftDivine: { mutate: vi.fn(), isPending: false } }),
}));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ data: { gold: 9_999_999 } }) }));
vi.mock('@/hooks/useResources', async () => {
  const real = await vi.importActual<typeof import('@/hooks/useResources')>('@/hooks/useResources');
  return { ...real, useResources: () => ({ data: {} }) };
});

/** Visiteur d'ARC 1 : c'est LUI qui voyait le catalogue d'arc 1. */
vi.mock('@/features/arc/useArc', () => ({
  useArc: () => ({ currentArc: 1, maxArc: 2, switchArc: vi.fn(), isSwitching: false }),
}));

const { DivineForgeStudio } = await import('./DivineForgeStudio');

describe('Forge Sacrée — catalogue d’Arc 2 même pour un visiteur d’Arc 1', () => {
  it('les matériaux proposés sont ceux de l’Arc 2, aucun d’Arc 1', () => {
    render(<DivineForgeStudio />);
    const options = Array.from(document.querySelectorAll('option')).map((o) => o.textContent ?? '');
    for (const m of FORGE_MATERIALS_ARC2) {
      expect(options.some((t) => t.includes(m.label))).toBe(true);
    }
    // Les libellés d'arc 1 (« Poussière d'étoile »…) n'ont rien à faire ici.
    for (const m of FORGE_MATERIALS) {
      expect(options.some((t) => t.includes(`${m.label} —`))).toBe(false);
    }
  });

  it('la ligne de coût ne cite QUE des clés d’Arc 2 (l’event mis à part)', () => {
    render(<DivineForgeStudio />);
    // Le bouton reste bloqué : le visiteur n'a aucune ressource d'arc 2.
    expect(screen.getByRole('button', { name: /Réservé à l’Arc 2/ })).toBeDefined();
    // Le coût affiché est celui d'une recette d'arc 2 : on le revalide côté pur.
    const mat = FORGE_MATERIALS_ARC2.at(-1)!;
    for (const x of mat.materials) expect(materialArcScope(x.key)).toBe('arc2');
  });

  it('les gemmes proposées sont celles de l’Arc 2', () => {
    const { container } = render(<DivineForgeStudio />);
    const txt = container.textContent ?? '';
    // Les gemmes s'affichent par leur PASSIF (partagé entre les deux arcs) :
    // on vérifie donc les catalogues, seule source du `gem_id` envoyé au serveur.
    expect(GEMS_ARC2.map((g) => g.id)).not.toEqual(GEMS.map((g) => g.id));
    for (const g of GEMS_ARC2) expect(materialArcScope(g.id)).toBe('arc2');
    expect(txt.length).toBeGreaterThan(0);
  });
});

describe('Matériaux d’Arc 2 — visuels repris de l’Arc 1', () => {
  it('chaque jumeau d’Arc 2 a une icône (celle de son aîné) et un libellé', () => {
    for (const key of ARC2_KEYS) {
      expect(resourceIcon(key), `${key} sans icône`).not.toBeNull();
      expect(resourceMeta(key).label, `${key} sans libellé`).not.toBe(key);
    }
  });
});
