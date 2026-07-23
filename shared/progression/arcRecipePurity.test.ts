import { describe, expect, it } from 'vitest';
import { SET_PIECES, SETS, setPieceRecipe, setArc } from './sets.ts';
import { relicRecipe, RELIC_BASES } from './relic.ts';
import { jewelRecipe } from './jewelry.ts';
import { craftRecipe } from './forge.ts';
import { divineRecipe } from './divine.ts';
import { FORGE_BASES } from './forge.ts';
import {
  forgeMaterialsForArc,
  gemsForArc,
  zoneBossMaterialForArc,
  materialArcScope,
} from './arcMaterials.ts';

/**
 * ÉTANCHÉITÉ DES RECETTES D'ARC 2.
 *
 * Une recette d'arc 2 ne doit citer AUCUNE clé d'arc 1 : le joueur ne possède
 * pas ces ressources (ses réserves sont au tier 2) et le serveur les lui
 * facturerait quand même — le craft devient impossible sans que rien ne
 * l'explique.
 *
 * Les fuites étaient TOUJOURS des constantes d'arc 1 oubliées au fond d'une
 * fonction, jamais un paramètre mal passé : `SET_DUNGEON_MATERIAL`
 * (`sceau_catacombe` en dur) et `zoneMaterialCost` (catalogue d'essences
 * d'arc 1). Ce test balaie donc TOUTES les recettes, pas seulement celles
 * qu'on soupçonne.
 */

/** `'both'` = ressource commune aux deux arcs (larme astrale, matériaux d'event). */
const leaks = (materials: { key: string }[]): string[] =>
  materials.filter((m) => materialArcScope(m.key) === 'arc1').map((m) => m.key);

const MAT2 = forgeMaterialsForArc(2);

describe('pièces de set d’arc 2', () => {
  const arc2Sets = new Set(SETS.filter((s) => setArc(s) === 2).map((s) => s.id));
  const pieces = SET_PIECES.filter((p) => arc2Sets.has(p.setId));

  it('il y a bien des pièces d’arc 2 à tester', () => {
    expect(pieces.length).toBeGreaterThan(0);
  });

  it('aucune ne réclame de ressource d’arc 1, quelle que soit la zone', () => {
    const bad: string[] = [];
    for (const p of pieces) {
      for (const mat of MAT2) {
        const found = leaks(setPieceRecipe(p, mat).materials);
        if (found.length) bad.push(`${p.id} @${mat.id}: ${found.join(', ')}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('le butin de donjon suit l’arc (sceau BRISÉ, pas le sceau d’arc 1)', () => {
    const r = setPieceRecipe(pieces[0]!, MAT2.at(-1)!);
    expect(r.materials.some((m) => m.key === 'sceau_catacombe_brise')).toBe(true);
    expect(r.materials.some((m) => m.key === 'sceau_catacombe')).toBe(false);
  });
});

describe('les autres ateliers en arc 2', () => {
  it('reliques : aucune clé d’arc 1', () => {
    const bad: string[] = [];
    for (const base of RELIC_BASES) {
      for (const mat of MAT2) {
        const boss = zoneBossMaterialForArc(mat.zone, 2);
        const found = leaks(relicRecipe(mat, boss, 2).materials);
        if (found.length) bad.push(`${base.id} @${mat.id}: ${found.join(', ')}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('bijoux : aucune clé d’arc 1', () => {
    for (const mat of MAT2) {
      for (const gem of gemsForArc(2)) expect(leaks(jewelRecipe(mat, gem).materials)).toEqual([]);
    }
  });

  it('forge (arme/armure) : aucune clé d’arc 1, essence comprise', () => {
    for (const mat of MAT2) {
      expect(leaks(craftRecipe(mat, zoneBossMaterialForArc(mat.zone, 2)).materials)).toEqual([]);
    }
  });

  it('Forge Sacrée : aucune clé d’arc 1 (hors matériau d’event, commun aux arcs)', () => {
    for (const base of FORGE_BASES.filter((b) => b.itemType === 'weapon' || b.itemType === 'armor')) {
      expect(leaks(divineRecipe(base, MAT2.at(-1)!, gemsForArc(2)[0]!).materials)).toEqual([]);
    }
  });
});

describe('l’arc 1 n’a pas bougé', () => {
  it('une pièce de set d’arc 1 garde EXACTEMENT ses clés d’arc 1', () => {
    const arc1Sets = new Set(SETS.filter((s) => setArc(s) === 1).map((s) => s.id));
    const piece = SET_PIECES.find((p) => arc1Sets.has(p.setId))!;
    const r = setPieceRecipe(piece, forgeMaterialsForArc(1).at(-1)!);
    expect(r.materials.some((m) => m.key === 'sceau_catacombe')).toBe(true);
    expect(r.materials.every((m) => materialArcScope(m.key) !== 'arc2')).toBe(true);
  });
});
