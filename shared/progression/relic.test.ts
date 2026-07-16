import { describe, expect, it } from 'vitest';
import {
  craftRelic,
  craftRelicAtRarity,
  relicRanges,
  relicRecipe,
  getRelicBase,
  RELIC_BASES,
} from './relic.ts';
import {
  getMaterialTier,
  FORGE_MATERIALS,
  SECONDARY_STAT_MIN_PCT,
  SECONDARY_STAT_MAX_PCT,
} from './forge.ts';
import { createRng } from '../combat/prng.ts';

const MAT = getMaterialTier('etoiles')!; // composant de zone puissant (tier 1, zone 10)

describe('craftRelic', () => {
  it('produit une relique nommée d’après son modèle + composant, avec des PV', () => {
    const base = getRelicBase('talisman_vigueur')!;
    const relic = craftRelic(base, MAT, createRng(42));
    expect(relic.item_type).toBe('relic');
    expect(relic.name).toContain('Talisman de Vigueur');
    expect(relic.name).toContain(MAT.suffix);
    expect(relic.weight).toBeNull();
    expect(relic.hp_bonus).toBeGreaterThan(0);
  });

  it('déterministe pour une même seed', () => {
    const base = getRelicBase('idole_guerre')!;
    const a = craftRelic(base, MAT, createRng(123));
    const b = craftRelic(base, MAT, createRng(123));
    expect(a).toEqual(b);
  });

  it('le biais oriente les stats : le talisman est surtout PV, l’idole surtout ATK', () => {
    const talisman = getRelicBase('talisman_vigueur')!;
    const idole = getRelicBase('idole_guerre')!;
    let sumHpT = 0;
    let sumAtkT = 0;
    let sumAtkI = 0;
    for (let s = 0; s < 100; s++) {
      const t = craftRelic(talisman, MAT, createRng(s));
      const i = craftRelic(idole, MAT, createRng(s));
      sumHpT += t.hp_bonus;
      sumAtkT += t.atk_bonus;
      sumAtkI += i.atk_bonus;
    }
    expect(sumHpT).toBeGreaterThan(sumAtkT); // talisman : PV >> ATK
    expect(sumAtkI).toBeGreaterThan(sumAtkT); // idole plus d'ATK que le talisman
  });

  it('une relique donne les TROIS stats, dominée par celle de son modèle', () => {
    const cases: [string, 'atk_bonus' | 'def_bonus' | 'hp_bonus'][] = [
      ['idole_guerre', 'atk_bonus'],
      ['egide_ancestrale', 'def_bonus'],
      ['talisman_vigueur', 'hp_bonus'],
    ];
    for (const [id, primaryKey] of cases) {
      const r = craftRelic(getRelicBase(id)!, MAT, createRng(5));
      const others = (['atk_bonus', 'def_bonus', 'hp_bonus'] as const).filter((k) => k !== primaryKey);
      expect(r[primaryKey], id).toBeGreaterThan(0);
      // Les deux autres existent (matériaux de boss) mais restent secondaires.
      for (const k of others) {
        expect(r[k], `${id}.${k}`).toBeGreaterThan(0);
        expect(r[k], `${id}.${k}`).toBeLessThan(r[primaryKey]);
      }
    }
  });

  it('les stats secondaires montent avec la zone (matériaux de boss)', () => {
    const base = getRelicBase('idole_guerre')!;
    const z1 = craftRelicAtRarity(base, getMaterialTier('chene')!, 'common'); // zone 1, pas de boss
    const z10 = craftRelicAtRarity(base, getMaterialTier('etoiles')!, 'common'); // zone 10
    // Part de la DEF (secondaire) rapportée à l'ATK (prioritaire) : 10 % → 35 %.
    expect(z1.def_bonus / z1.atk_bonus).toBeCloseTo(SECONDARY_STAT_MIN_PCT, 1);
    expect(z10.def_bonus / z10.atk_bonus).toBeCloseTo(SECONDARY_STAT_MAX_PCT, 1);
  });

  it('la prioritaire reste la prioritaire, quelle que soit la zone', () => {
    for (const matId of ['chene', 'obsidienne', 'etoiles']) {
      const r = craftRelicAtRarity(getRelicBase('egide_ancestrale')!, getMaterialTier(matId)!, 'ultimate');
      expect(r.def_bonus, matId).toBeGreaterThan(r.atk_bonus);
      // Les PV sont sur une échelle 2× : on compare à part pour ne pas se
      // faire piéger par l'unité, mais la DEF doit rester dominante à échelle égale.
      expect(r.def_bonus, matId).toBeGreaterThan(r.hp_bonus / 2);
    }
  });

  it('un composant plus puissant → relique plus forte', () => {
    const base = getRelicBase('talisman_vigueur')!;
    const faible = craftRelic(base, getMaterialTier('chene')!, createRng(7)); // zone 1
    const fort = craftRelic(base, getMaterialTier('etoiles')!, createRng(7)); // zone 10
    expect(fort.hp_bonus).toBeGreaterThan(faible.hp_bonus);
  });

  it('les stats craftées restent dans la range affichée', () => {
    for (const base of RELIC_BASES) {
      for (const mat of FORGE_MATERIALS) {
        const ranges = relicRanges(base, mat);
        for (let s = 0; s < 20; s++) {
          const r = craftRelic(base, mat, createRng(s * 17 + 1));
          expect(r.atk_bonus).toBeGreaterThanOrEqual(ranges.atk[0]);
          expect(r.atk_bonus).toBeLessThanOrEqual(ranges.atk[1]);
          expect(r.def_bonus).toBeGreaterThanOrEqual(ranges.def[0]);
          expect(r.def_bonus).toBeLessThanOrEqual(ranges.def[1]);
          expect(r.hp_bonus).toBeGreaterThanOrEqual(ranges.hp[0]);
          expect(r.hp_bonus).toBeLessThanOrEqual(ranges.hp[1]);
        }
      }
    }
  });

  it('la recette consomme le composant de zone + fragments + sceau de donjon', () => {
    const recipe = relicRecipe(MAT);
    expect(recipe.gold).toBeGreaterThan(0);
    const keys = recipe.materials.map((m) => m.key);
    // Matériaux du composant de zone (ex. poussiere_etoile pour "etoiles").
    expect(keys).toContain(MAT.materials[0]!.key);
    // Matériaux de donjon.
    expect(keys).toContain('fragment_relique');
    expect(keys).toContain('sceau_catacombe');
  });

  it('une relique plus forte exige plus de fragments de relique', () => {
    const fragsOf = (matId: string) => {
      const recipe = relicRecipe(getMaterialTier(matId)!);
      return recipe.materials.find((m) => m.key === 'fragment_relique')!.qty;
    };
    // Coût strictement croissant de la zone 1 → 10.
    const faible = fragsOf('chene'); // zone 1
    const moyen = fragsOf('obsidienne'); // zone 5
    const fort = fragsOf('etoiles'); // zone 10
    expect(moyen).toBeGreaterThan(faible);
    expect(fort).toBeGreaterThan(moyen);
    expect(faible).toBe(5); // early game inchangé
  });
});
