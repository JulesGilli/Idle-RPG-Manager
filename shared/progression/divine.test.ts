import { describe, expect, it } from 'vitest';
import {
  DIVINE_STAT_MULT,
  DIVINE_EVENT_COST,
  divineStats,
  divinePassive,
  divineRecipe,
  divineName,
  isDivineForgeable,
} from './divine.ts';
import { FORGE_BASES, getMaterialTier, craftItemAtRarity } from './forge.ts';
import { GEMS } from './jewelry.ts';
import { EVENT_MATERIALS, eventRankMaterialQty } from './eventMaterials.ts';

const weapon = FORGE_BASES.find((b) => b.itemType === 'weapon')!;
const armor = FORGE_BASES.find((b) => b.itemType === 'armor')!;
const etoiles = getMaterialTier('etoiles')!; // zone 10
const chene = getMaterialTier('chene')!; // zone 1
const gem = GEMS.find((g) => g.passive === 'lifesteal')!;

describe('Forge Sacrée — arme et armure seulement', () => {
  it('arme et armure sont forgeables en Divin, pas bijou/relique', () => {
    expect(isDivineForgeable(weapon)).toBe(true);
    expect(isDivineForgeable(armor)).toBe(true);
  });
});

describe('objet Divin — stats', () => {
  it('sont AU-DESSUS d’un Ultime du même modèle/zone', () => {
    const ult = craftItemAtRarity(weapon, etoiles, null, 'ultimate');
    const div = divineStats(weapon, etoiles);
    expect(div.atk).toBeGreaterThan(ult.atk_bonus);
    expect(div.atk).toBe(Math.round(ult.atk_bonus * DIVINE_STAT_MULT));
  });

  it('montent avec la zone du matériau', () => {
    expect(divineStats(weapon, etoiles).atk).toBeGreaterThan(divineStats(weapon, chene).atk);
  });

  it('respectent le profil du modèle (une armure défend, ne frappe pas)', () => {
    const a = divineStats(armor, etoiles);
    expect(a.def).toBeGreaterThan(0);
    expect(a.atk).toBe(0);
  });
});

describe('objet Divin — effet de gemme', () => {
  it('porte le passif de la gemme, à son plafond', () => {
    const p = divinePassive(gem);
    expect(p.type).toBe('lifesteal');
    expect(p.value).toBe(gem.maxPct);
  });

  it('le nom combine modèle et gemme, sceau divin en tête', () => {
    const n = divineName(weapon, gem);
    expect(n.startsWith('✦')).toBe(true);
    expect(n).toContain(weapon.label);
    expect(n).toContain(gem.epithet);
  });
});

describe('objet Divin — recette', () => {
  it('l’arme coûte l’Éclat sacré (World Boss)', () => {
    const r = divineRecipe(weapon, etoiles, gem);
    const keys = r.materials.map((m) => m.key);
    expect(keys).toContain(EVENT_MATERIALS.world_boss.key); // eclat_sacre
    expect(keys).toContain(gem.id);
    expect(keys).toContain(etoiles.materials[0]!.key);
    const ev = r.materials.find((m) => m.key === EVENT_MATERIALS.world_boss.key)!;
    expect(ev.qty).toBe(DIVINE_EVENT_COST);
  });

  it('l’armure coûte la Poussière bénie (week-end)', () => {
    const r = divineRecipe(armor, etoiles, gem);
    expect(r.materials.map((m) => m.key)).toContain(EVENT_MATERIALS.weekend.key); // poussiere_benie
  });

  it('le coût en matériau = la part du 5e (top 5 forge 1/semaine)', () => {
    expect(DIVINE_EVENT_COST).toBe(eventRankMaterialQty(5));
  });
});
