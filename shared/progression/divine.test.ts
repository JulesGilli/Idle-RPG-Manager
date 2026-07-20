import { describe, expect, it } from 'vitest';
import {
  DIVINE_STAT_MULT,
  DIVINE_EVENT_COST,
  divineRelicStats,
  divineRelicPassive,
  divineRelicRecipe,
  divineRelicName,
} from './divine.ts';
import { RELIC_BASES, craftRelicAtRarity } from './relic.ts';
import { getMaterialTier } from './forge.ts';
import { GEMS } from './jewelry.ts';
import { EVENT_MATERIALS, eventRankMaterialQty } from './eventMaterials.ts';

const base = RELIC_BASES.find((b) => b.primary === 'atk')!; // Idole de Guerre
const etoiles = getMaterialTier('etoiles')!; // zone 10
const chene = getMaterialTier('chene')!; // zone 1
const gem = GEMS.find((g) => g.passive === 'lifesteal')!; // gemme abyssale

describe('Relique divine — stats', () => {
  it('sont AU-DESSUS d’un Ultime maxé du même modèle/zone', () => {
    const ult = craftRelicAtRarity(base, etoiles, null, 'ultimate');
    const div = divineRelicStats(base, etoiles);
    expect(div.atk).toBeGreaterThan(ult.atk_bonus);
    // ...mais bornées : exactement le multiplicateur, pas plus.
    expect(div.atk).toBe(Math.round(ult.atk_bonus * DIVINE_STAT_MULT));
  });

  it('restent focalisées sur la stat primaire du modèle (mono-stat)', () => {
    const div = divineRelicStats(base, etoiles); // primaire = atk
    expect(div.atk).toBeGreaterThan(0);
    expect(div.def).toBe(0);
    expect(div.hp).toBe(0);
  });

  it('montent avec la zone du matériau', () => {
    expect(divineRelicStats(base, etoiles).atk).toBeGreaterThan(
      divineRelicStats(base, chene).atk,
    );
  });
});

describe('Relique divine — effet de gemme', () => {
  it('porte le passif de la gemme, à son plafond', () => {
    const p = divineRelicPassive(gem);
    expect(p.type).toBe('lifesteal');
    expect(p.value).toBe(gem.maxPct);
  });

  it('le nom combine modèle et gemme, sceau divin en tête', () => {
    expect(divineRelicName(base, gem)).toContain(base.label);
    expect(divineRelicName(base, gem)).toContain(gem.epithet);
    expect(divineRelicName(base, gem).startsWith('✦')).toBe(true);
  });
});

describe('Relique divine — recette', () => {
  it('coûte l’Éclat sacré + le farm de la zone + 1 gemme', () => {
    const r = divineRelicRecipe(etoiles, gem);
    const keys = r.materials.map((m) => m.key);
    expect(keys).toContain(EVENT_MATERIALS.world_boss.key); // eclat_sacre
    expect(keys).toContain(gem.id);
    // Le farm de la zone (poussière d'étoile) est présent.
    expect(keys).toContain(etoiles.materials[0]!.key);
    const eclat = r.materials.find((m) => m.key === EVENT_MATERIALS.world_boss.key)!;
    expect(eclat.qty).toBe(DIVINE_EVENT_COST);
  });

  it('le coût en Éclat = la part du 5e (top 5 forge 1/semaine)', () => {
    expect(DIVINE_EVENT_COST).toBe(eventRankMaterialQty(5));
  });
});
