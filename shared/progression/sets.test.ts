import { describe, expect, it } from 'vitest';
import {
  computeSetBonuses,
  activeSets,
  SETS,
  SET_PIECES,
  setPieceRecipe,
  SET_BOSS_COMPONENT,
  SET_ZONE_MATERIAL,
  SET_DUNGEON_MATERIAL,
} from './sets.ts';

describe('item sets', () => {
  it('aucun bonus en dessous de 2 pièces', () => {
    expect(computeSetBonuses(['sylve', null, null, null])).toEqual({ atk: 0, def: 0, hp: 0 });
    expect(computeSetBonuses([null, null, null, null])).toEqual({ atk: 0, def: 0, hp: 0 });
  });

  it('bonus 2 pièces', () => {
    const sylve = SETS.find((s) => s.id === 'sylve')!;
    expect(computeSetBonuses(['sylve', 'sylve', null, null])).toEqual(sylve.bonus2);
  });

  it('bonus 4 pièces = bonus2 + bonus4 cumulés', () => {
    const s = SETS.find((x) => x.id === 'sylve')!;
    expect(computeSetBonuses(['sylve', 'sylve', 'sylve', 'sylve'])).toEqual({
      atk: s.bonus2.atk + s.bonus4.atk,
      def: s.bonus2.def + s.bonus4.def,
      hp: s.bonus2.hp + s.bonus4.hp,
    });
  });

  it('cumule plusieurs sets partiels', () => {
    const r = computeSetBonuses(['sylve', 'sylve', 'arcane', 'arcane']);
    const sy = SETS.find((x) => x.id === 'sylve')!.bonus2;
    const ar = SETS.find((x) => x.id === 'arcane')!.bonus2;
    expect(r).toEqual({ atk: sy.atk + ar.atk, def: sy.def + ar.def, hp: sy.hp + ar.hp });
  });

  it('activeSets ne liste que les sets à ≥2 pièces', () => {
    const a = activeSets(['sylve', 'sylve', 'arcane', null]);
    expect(a).toHaveLength(1);
    expect(a[0]!.set.id).toBe('sylve');
    expect(a[0]!.count).toBe(2);
  });
});

describe('recette composée de set', () => {
  it('réunit zone + expédition + boss (ensemble) + donjon', () => {
    const piece = SET_PIECES.find((p) => p.setId === 'sylve')!;
    const recipe = setPieceRecipe(piece);
    const keys = recipe.materials.map((m) => m.key);
    expect(keys).toContain(SET_ZONE_MATERIAL.key); // zone (carte)
    expect(keys).toContain(piece.materials[0]!.key); // expédition (signature)
    expect(keys).toContain(SET_BOSS_COMPONENT.sylve); // boss → ensemble
    expect(keys).toContain(SET_DUNGEON_MATERIAL.key); // donjon
    expect(recipe.gold).toBe(piece.gold);
  });

  it('le composant de boss diffère selon l’ensemble', () => {
    const sylve = setPieceRecipe(SET_PIECES.find((p) => p.setId === 'sylve')!);
    const arcane = setPieceRecipe(SET_PIECES.find((p) => p.setId === 'arcane')!);
    const bossOf = (r: { materials: { key: string }[] }) =>
      r.materials.map((m) => m.key).filter((k) => Object.values(SET_BOSS_COMPONENT).includes(k));
    expect(bossOf(sylve)).toEqual([SET_BOSS_COMPONENT.sylve]);
    expect(bossOf(arcane)).toEqual([SET_BOSS_COMPONENT.arcane]);
  });

  it('aucune clé de matériau dupliquée dans une recette', () => {
    for (const p of SET_PIECES) {
      const keys = setPieceRecipe(p).materials.map((m) => m.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
