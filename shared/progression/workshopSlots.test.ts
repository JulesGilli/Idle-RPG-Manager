import { describe, it, expect } from 'vitest';
import { SET_PIECES, WORKSHOP_SLOTS, setPiecesForWorkshop, type SlotType } from './sets.ts';

/**
 * L'action serveur `craft_set` est COMMUNE aux trois ateliers (Forge, Joaillerie,
 * Autel) et ne valide pas le slot : c'est donc à chaque atelier de ne présenter
 * que ce qui le concerne. Ces tests garantissent que le partage est étanche —
 * la Forge a déjà proposé les 24 pièces, bijoux et reliques compris.
 */
describe('slots par atelier', () => {
  it('la Forge ne propose que des armes et des armures', () => {
    const slots = new Set(setPiecesForWorkshop('forge').map((p) => p.slot));
    expect([...slots].sort()).toEqual(['armor', 'weapon']);
  });

  it('la Joaillerie ne propose que des bijoux, l’Autel que des reliques', () => {
    expect(new Set(setPiecesForWorkshop('jewelry').map((p) => p.slot))).toEqual(new Set(['jewel']));
    expect(new Set(setPiecesForWorkshop('altar').map((p) => p.slot))).toEqual(new Set(['relic']));
  });

  it('chaque pièce appartient à un atelier et un seul', () => {
    const workshops = Object.keys(WORKSHOP_SLOTS) as (keyof typeof WORKSHOP_SLOTS)[];
    for (const piece of SET_PIECES) {
      const owners = workshops.filter((w) => setPiecesForWorkshop(w).some((p) => p.id === piece.id));
      expect(owners, piece.id).toHaveLength(1);
    }
  });

  it('les ateliers couvrent TOUTES les pièces — aucune ne devient introuvable', () => {
    const covered = (Object.keys(WORKSHOP_SLOTS) as (keyof typeof WORKSHOP_SLOTS)[]).flatMap((w) =>
      setPiecesForWorkshop(w).map((p) => p.id),
    );
    expect(covered.sort()).toEqual(SET_PIECES.map((p) => p.id).sort());
  });

  it('couvre les 4 slots du jeu', () => {
    const all = Object.values(WORKSHOP_SLOTS).flat() as SlotType[];
    expect(new Set(all)).toEqual(new Set(['weapon', 'armor', 'jewel', 'relic']));
  });
});
