import { describe, expect, it } from 'vitest';
import {
  DIVINE_STAT_MULT,
  DIVINE_ARMOR_HPDEF_MULT,
  DIVINE_ARMOR_ATK_RATIO,
  divineEventCost,
  divineStats,
  divinePassive,
  divineRecipe,
  divineName,
  isDivineForgeable,
} from './divine.ts';
import { FORGE_BASES, getMaterialTier, craftItemAtRarity, zoneBossMaterial, weaponPassiveSpec } from './forge.ts';
import { divineWeaponModelPassive } from './heroLoan.ts';
import { GEMS } from './jewelry.ts';
import { EVENT_MATERIALS, eventRankMaterialQty } from './eventMaterials.ts';
import { BATTLEFIELD_COOLDOWN_HOURS, BATTLEFIELD_DUST_REWARD } from './battlefield.ts';

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
  it('sont AU-DESSUS du MEILLEUR Ultime du même modèle/zone (essence comprise)', () => {
    // La référence est l'ultime avec l'ESSENCE de sa zone — le meilleur objet que
    // le joueur puisse forger. Comparé à un ultime SANS essence, le Divin passait
    // pour supérieur alors qu'il perdait tout le secondaire (DEF/PV à zéro).
    const ult = craftItemAtRarity(weapon, etoiles, zoneBossMaterial(etoiles.zone), 'ultimate');
    const div = divineStats(weapon, etoiles);
    expect(div.atk).toBe(Math.round(ult.atk_bonus * DIVINE_STAT_MULT));
    expect(div.atk).toBeGreaterThan(ult.atk_bonus);
    // …et il ne doit JAMAIS être en retrait sur une stat : c'est ce qui manquait.
    expect(div.def).toBeGreaterThanOrEqual(ult.def_bonus);
    expect(div.hp).toBeGreaterThanOrEqual(ult.hp_bonus);
  });

  it('montent avec la zone du matériau', () => {
    expect(divineStats(weapon, etoiles).atk).toBeGreaterThan(divineStats(weapon, chene).atk);
  });

  it('ARMURE divine : PV/DEF doublés + une stat d’ATK dérivée de la DEF', () => {
    const ult = craftItemAtRarity(armor, etoiles, zoneBossMaterial(etoiles.zone), 'ultimate');
    const a = divineStats(armor, etoiles);
    const baseDef = Math.round(ult.def_bonus * DIVINE_STAT_MULT);
    expect(a.def).toBe(baseDef * DIVINE_ARMOR_HPDEF_MULT);
    expect(a.hp).toBe(Math.round(ult.hp_bonus * DIVINE_STAT_MULT) * DIVINE_ARMOR_HPDEF_MULT);
    // L'armure frappe désormais : ATK = ratio de sa DEF divine (avant doublement).
    expect(a.atk).toBe(
      Math.round(ult.atk_bonus * DIVINE_STAT_MULT) + Math.round(baseDef * DIVINE_ARMOR_ATK_RATIO),
    );
    expect(a.atk).toBeGreaterThan(0);
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

describe('objet Divin — recette (mapping revu le 22 juil.)', () => {
  it('l’armure coûte l’Éclat sacré (World Boss)', () => {
    const r = divineRecipe(armor, etoiles, gem);
    const keys = r.materials.map((m) => m.key);
    expect(keys).toContain(EVENT_MATERIALS.world_boss.key); // eclat_sacre
    expect(keys).toContain(gem.id);
    expect(keys).toContain(etoiles.materials[0]!.key);
    const ev = r.materials.find((m) => m.key === EVENT_MATERIALS.world_boss.key)!;
    expect(ev.qty).toBe(divineEventCost('armor'));
  });

  it('l’arme coûte la Poussière bénie (Défense du village)', () => {
    const r = divineRecipe(weapon, etoiles, gem);
    const ev = r.materials.find((m) => m.key === EVENT_MATERIALS.village_defense.key)!; // poussiere_benie
    expect(ev).toBeDefined();
    expect(ev.qty).toBe(divineEventCost('weapon'));
  });

  it('le coût de l’ARMURE ≤ la part du 5e au classement (top 5 forge ≥1/semaine)', () => {
    // Barème ×2 le 26 juil. : la part du 5e (6) couvre DEUX armures (coût 3).
    // La règle du roadmap reste un invariant : au moins un craft par semaine.
    expect(divineEventCost('armor')).toBeLessThanOrEqual(eventRankMaterialQty(5));
  });

  it('le coût de l’ARME reste au-dessus du max atteignable en UN cooldown (12h)', () => {
    // Garde-fou d'économie : au tarif d'UNE seule victoire (BATTLEFIELD_DUST_REWARD),
    // on ne forge pas une arme en un seul cooldown — plusieurs journées de farm.
    expect(divineEventCost('weapon')).toBeGreaterThan(BATTLEFIELD_DUST_REWARD);
    expect(BATTLEFIELD_COOLDOWN_HOURS).toBeGreaterThan(0); // le cooldown existe bien
  });
});

describe('arme Divine — passif de MODÈLE (crit de l’arc, esquive de la dague)', () => {
  it('une arme divine conserve le passif de son modèle, comme une arme classique', () => {
    const arc = FORGE_BASES.find((b) => b.id === 'arc')!;
    const gemLifesteal = GEMS.find((g) => g.passive === 'lifesteal')!;
    const p = divineWeaponModelPassive({ name: divineName(arc, gemLifesteal) });
    expect(p?.type).toBe('crit');
    // Au plafond du modèle : un Divin est une pièce de fin de partie.
    expect(p?.value).toBeCloseTo(weaponPassiveSpec('arc')!.maxPct / 100, 5);
  });

  it('la dague divine porte l’esquive, l’épée (sans passif de modèle) rien', () => {
    const gem = GEMS[0]!;
    const dague = FORGE_BASES.find((b) => b.id === 'dague')!;
    const epee = FORGE_BASES.find((b) => b.id === 'epee')!;
    expect(divineWeaponModelPassive({ name: divineName(dague, gem) })?.type).toBe('dodge');
    expect(divineWeaponModelPassive({ name: divineName(epee, gem) })).toBeNull();
  });

  it('ne s’applique QU’aux objets divins (sceau ✦)', () => {
    expect(divineWeaponModelPassive({ name: 'Arc en chêne' })).toBeNull();
    expect(divineWeaponModelPassive(null)).toBeNull();
  });
});
