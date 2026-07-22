import { describe, expect, it } from 'vitest';
import { FORGE_BASES, craftStatsByRarity, craftItemAtRarity, craftRanges, zoneBossMaterial, FORGE_MATERIALS } from './forge.ts';
import { GEMS, jewelPctByRarity, jewelPct } from './jewelry.ts';
import { RARITY_ORDER } from './loot.ts';

/**
 * Le tableau « par qualité » (Forge & Joaillerie) doit annoncer EXACTEMENT ce
 * que le craft fabrique — même source, sinon l'aperçu ment.
 */

const mat = FORGE_MATERIALS.at(-1)!;

describe('craftStatsByRarity (arme/armure)', () => {
  const base = FORGE_BASES.find((b) => b.itemType === 'weapon')!;
  const boss = zoneBossMaterial(mat.zone);

  it('couvre toutes les raretés, dans l’ordre', () => {
    expect(craftStatsByRarity(base, mat, boss).map((r) => r.rarity)).toEqual(RARITY_ORDER);
  });

  it('progresse et colle au craft réel + aux bouts de la fourchette', () => {
    const rows = craftStatsByRarity(base, mat, boss);
    for (let i = 1; i < rows.length; i++) expect(rows[i]!.atk).toBeGreaterThanOrEqual(rows[i - 1]!.atk);
    for (const row of rows) {
      const real = craftItemAtRarity(base, mat, boss, row.rarity);
      expect([row.atk, row.def, row.hp]).toEqual([real.atk_bonus, real.def_bonus, real.hp_bonus]);
    }
    const range = craftRanges(base, mat, boss);
    expect([rows[0]!.atk, rows.at(-1)!.atk]).toEqual(range.atk);
  });
});

describe('jewelPctByRarity (bijou)', () => {
  const gem = GEMS[0]!;
  it('couvre toutes les raretés et colle au % du craft', () => {
    const rows = jewelPctByRarity(mat, gem);
    expect(rows.map((r) => r.rarity)).toEqual(RARITY_ORDER);
    for (const row of rows) expect(row.pct).toBe(jewelPct(mat, gem, row.rarity));
  });
});
