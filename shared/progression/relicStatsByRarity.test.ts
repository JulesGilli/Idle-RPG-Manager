import { describe, expect, it } from 'vitest';
import { RELIC_BASES, relicStatsByRarity, relicRanges, craftRelicAtRarity } from './relic.ts';
import { FORGE_MATERIALS, zoneBossMaterial } from './forge.ts';
import { RARITY_ORDER } from './loot.ts';

/**
 * L'Autel tire une rareté au hasard. Une fourchette « 40 à 120 ATK » ne dit pas
 * ce que rapporte le tirage le plus probable — d'où ce détail par qualité.
 */

const base = RELIC_BASES[0]!;
const mat = FORGE_MATERIALS.at(-1)!;
const boss = zoneBossMaterial(mat.zone);

describe('relicStatsByRarity', () => {
  it('couvre toutes les raretés, dans l’ordre du jeu', () => {
    expect(relicStatsByRarity(base, mat, boss).map((r) => r.rarity)).toEqual(RARITY_ORDER);
  });

  it('progresse : chaque cran vaut au moins le précédent', () => {
    const rows = relicStatsByRarity(base, mat, boss);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.atk).toBeGreaterThanOrEqual(rows[i - 1]!.atk);
      expect(rows[i]!.hp).toBeGreaterThanOrEqual(rows[i - 1]!.hp);
    }
    expect(rows.at(-1)!.atk).toBeGreaterThan(rows[0]!.atk);
  });

  it('colle EXACTEMENT aux deux bouts de `relicRanges`', () => {
    // Les deux aperçus sont affichés côte à côte : s'ils divergeaient, le joueur
    // verrait deux chiffres différents pour un même objet.
    const rows = relicStatsByRarity(base, mat, boss);
    const range = relicRanges(base, mat, boss);
    expect([rows[0]!.atk, rows.at(-1)!.atk]).toEqual(range.atk);
    expect([rows[0]!.def, rows.at(-1)!.def]).toEqual(range.def);
    expect([rows[0]!.hp, rows.at(-1)!.hp]).toEqual(range.hp);
  });

  it('annonce ce que le craft FABRIQUE réellement (même source)', () => {
    for (const row of relicStatsByRarity(base, mat, boss)) {
      const real = craftRelicAtRarity(base, mat, boss, row.rarity);
      expect({ atk: row.atk, def: row.def, hp: row.hp }).toEqual({
        atk: real.atk_bonus,
        def: real.def_bonus,
        hp: real.hp_bonus,
      });
    }
  });

  it('sans essence, seule la stat PRIORITAIRE est servie', () => {
    const rows = relicStatsByRarity(base, mat, null);
    const others = (['atk', 'def', 'hp'] as const).filter((s) => s !== base.primary);
    for (const row of rows) {
      expect(row[base.primary]).toBeGreaterThan(0);
      for (const s of others) expect(row[s]).toBe(0);
    }
  });
});
